// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RouterHelper} from "./utils/RouterHelper.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaPool} from "../src/StoaPool.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {MockToken, MockAdapter, MockWHYPE, MockV2Factory, MockPermit2, MockQuoteGuard} from "./mocks/Mocks.sol";
import {IQuoteGuard} from "../src/interfaces/IStoa.sol";
import {ISignatureTransfer} from "../src/StoaRouter.sol";
import {UniswapV2Adapter, IUniswapV2Factory} from "../src/adapters/UniswapV2Adapter.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";

contract StoaTest is RouterHelper {
    MakerRegistry reg;
    FeeDistributor fees;
    StoaPool pool;
    StoaRouter router;
    MockWHYPE whype; // 18 decimals
    MockToken usdc; // 6 decimals
    MockAdapter uni;
    MockPermit2 permit2;

    address gov = makeAddr("gov");
    address treasury = makeAddr("treasury");
    address curator = makeAddr("curator");
    address maker = makeAddr("maker");
    address alice = makeAddr("alice");
    address ref = makeAddr("ref");

    uint128 constant BID = 39_900_000; // 39.90 USDC per WHYPE
    uint128 constant ASK = 40_100_000; // 40.10 USDC per WHYPE
    uint256 constant CAP = 500e6; // $500 per swap

    function setUp() public {
        whype = new MockWHYPE();
        usdc = new MockToken("USDC", 6);
        reg = new MakerRegistry(gov, treasury, 1 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        pool = new StoaPool(
            address(whype), address(usdc), IMakerRegistry(address(reg)), IFeeDistributor(address(fees)), curator, CAP
        );
        permit2 = new MockPermit2();
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(whype), ISignatureTransfer(address(permit2)), 1 days
        );
        uni = new MockAdapter(39e6, 1e18); // 39.00 USDC per WHYPE, worse than makers

        vm.startPrank(gov);
        reg.listPool(address(pool), 10 ether);
        reg.setMakerApproval(address(pool), maker, true);
        router.addPool(address(pool));
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();

        vm.deal(maker, 100 ether);
        vm.prank(maker);
        reg.bond{value: 20 ether}(address(pool));

        // inventory: 20 WHYPE + 1,500 USDC (launch plan)
        whype.mint(address(pool), 20 ether);
        usdc.mint(address(pool), 1_500e6);
        // fallback venue liquidity
        whype.mint(address(uni), 1_000 ether);
        usdc.mint(address(uni), 1_000_000e6);

        whype.mint(alice, 100 ether);
        usdc.mint(alice, 100_000e6);
        vm.startPrank(alice);
        whype.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        whype.approve(address(pool), type(uint256).max);
        usdc.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function _quote() internal {
        vm.prank(maker);
        pool.setQuote(BID, ASK, 10 ether, 10 ether, 2);
    }

    // ------------------------------------------------------------ registry

    function test_makerMustBeApprovedAndBonded() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(StoaPool.NotMaker.selector);
        pool.setQuote(BID, ASK, 1 ether, 1 ether, 2);

        vm.prank(maker);
        reg.requestUnbond(address(pool), 15 ether); // bond drops to 5 < 10 minimum
        vm.prank(maker);
        vm.expectRevert(StoaPool.NotMaker.selector);
        pool.setQuote(BID, ASK, 1 ether, 1 ether, 2);
    }

    function test_unbondDelayAndWithdraw() public {
        vm.startPrank(maker);
        reg.requestUnbond(address(pool), 5 ether);
        vm.expectRevert(MakerRegistry.StillLocked.selector);
        reg.withdrawUnbonded(address(pool));
        skip(1 days);
        uint256 b = maker.balance;
        reg.withdrawUnbonded(address(pool));
        assertEq(maker.balance - b, 5 ether);
        vm.stopPrank();
    }

    function test_slashGoesToTreasury() public {
        vm.prank(gov);
        reg.slash(address(pool), maker, 12 ether);
        assertEq(treasury.balance, 12 ether);
        (uint128 amt,,) = reg.bonds(address(pool), maker);
        assertEq(amt, 8 ether);
        assertFalse(reg.isActiveMaker(address(pool), maker));
    }

    function test_slashOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        reg.slash(address(pool), maker, 1 ether);
    }

    // ------------------------------------------------------------ pool

    function test_badQuotesRejected() public {
        vm.startPrank(maker);
        vm.expectRevert(StoaPool.BadQuote.selector);
        pool.setQuote(ASK, BID, 1 ether, 1 ether, 2); // crossed
        vm.expectRevert(StoaPool.BadQuote.selector);
        pool.setQuote(BID, ASK, 1 ether, 1 ether, 3); // too long
        vm.expectRevert(StoaPool.BadQuote.selector);
        pool.setQuote(BID, ASK, 1 ether, 1 ether, 0);
        vm.stopPrank();
    }

    function test_sellBaseAtBid() public {
        _quote();
        vm.prank(alice);
        uint256 out = pool.swap(address(whype), 2 ether, 0, alice, address(0));
        uint256 gross = 2 * uint256(BID); // 79.80 USDC
        uint256 fee = gross * 2 / 10_000;
        assertEq(out, gross - fee);
        assertEq(usdc.balanceOf(address(fees)), fee);
        (,, uint96 bidSize,,) = pool.current();
        assertEq(bidSize, 8 ether);
    }

    function test_buyBaseAtAsk() public {
        _quote();
        vm.prank(alice);
        uint256 out = pool.swap(address(usdc), 401e6, 0, alice, address(0)); // buys ~10 WHYPE
        uint256 gross = 401e6 * 1e18 / ASK;
        assertEq(out, gross - gross * 2 / 10_000);
        assertApproxEqAbs(gross, 10 ether, 1e6);
    }

    function test_expiredQuoteCannotFill() public {
        _quote();
        vm.roll(block.number + 2);
        vm.prank(alice);
        vm.expectRevert(StoaPool.QuoteExpired.selector);
        pool.swap(address(whype), 1 ether, 0, alice, address(0));
        assertEq(pool.quoteOut(address(whype), 1 ether), 0);
    }

    function test_validForTwoBlocks() public {
        _quote();
        vm.roll(block.number + 1);
        vm.prank(alice);
        pool.swap(address(whype), 1 ether, 0, alice, address(0));
    }

    function test_sizeIsConsumed() public {
        _quote();
        vm.startPrank(alice);
        pool.swap(address(whype), 6 ether, 0, alice, address(0));
        vm.expectRevert(StoaPool.SizeExceeded.selector);
        pool.swap(address(whype), 6 ether, 0, alice, address(0));
        vm.stopPrank();
    }

    function test_capPerSwap() public {
        vm.prank(maker);
        pool.setQuote(BID, ASK, 100 ether, 100 ether, 2);
        usdc.mint(address(pool), 10_000e6);
        vm.startPrank(alice);
        vm.expectRevert(StoaPool.CapExceeded.selector);
        pool.swap(address(usdc), 501e6, 0, alice, address(0));
        vm.expectRevert(StoaPool.CapExceeded.selector);
        pool.swap(address(whype), 13 ether, 0, alice, address(0)); // 518.7 USDC
        pool.swap(address(usdc), 500e6, 0, alice, address(0));
        vm.stopPrank();
    }

    function test_slippageProtection() public {
        _quote();
        vm.prank(alice);
        vm.expectRevert(StoaPool.Slippage.selector);
        pool.swap(address(whype), 1 ether, 40e6, alice, address(0));
    }

    function test_pauseAndCancel() public {
        _quote();
        vm.prank(gov);
        pool.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(StoaPool.IsPaused.selector);
        pool.swap(address(whype), 1 ether, 0, alice, address(0));
        vm.prank(gov);
        pool.setPaused(false);

        vm.prank(maker);
        pool.cancelQuote();
        vm.prank(alice);
        vm.expectRevert(StoaPool.QuoteExpired.selector);
        pool.swap(address(whype), 1 ether, 0, alice, address(0));
    }

    function test_delistedPoolCannotTradeOrNotify() public {
        _quote();
        vm.prank(gov);
        reg.delistPool(address(pool));
        vm.prank(alice);
        vm.expectRevert(StoaPool.IsPaused.selector);
        pool.swap(address(whype), 1 ether, 0, alice, address(0));
    }

    function test_onlyOwnerWithdraws() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(address(usdc), 1, alice);
        vm.prank(curator);
        pool.withdraw(address(usdc), 100e6, curator);
        assertEq(usdc.balanceOf(curator), 100e6);
    }

    function test_quoteGuardRejectsOffMarketQuotes() public {
        MockQuoteGuard g = new MockQuoteGuard(40e6, 100); // mid $40, +-1%
        vm.prank(curator);
        vm.expectRevert(StoaPool.NotGuardian.selector);
        pool.setQuoteGuard(IQuoteGuard(address(g)));
        vm.prank(gov);
        pool.setQuoteGuard(IQuoteGuard(address(g)));

        _quote(); // 39.90 / 40.10 is inside +-1%
        vm.prank(maker);
        vm.expectRevert(StoaPool.QuoteRejected.selector);
        pool.setQuote(30e6, 40_100_000, 10 ether, 10 ether, 2); // bid far below the reference

        vm.prank(gov);
        pool.setQuoteGuard(IQuoteGuard(address(0)));
        vm.prank(maker);
        pool.setQuote(30e6, 40_100_000, 10 ether, 10 ether, 2); // guard off: maker's own risk
    }

    function test_feeIsGuardianOnlyAndCapped() public {
        vm.prank(curator);
        vm.expectRevert(StoaPool.NotGuardian.selector);
        pool.setFeeBps(0);
        vm.prank(gov);
        vm.expectRevert(StoaPool.TooHigh.selector);
        pool.setFeeBps(31);
    }

    // ------------------------------------------------------------ router

    function test_routerPrefersMakerQuote() public {
        _quote();
        uint256 out = _swapAs(router, alice, address(whype), address(usdc), 1 ether, 0, alice, ref);
        uint256 gross = uint256(BID);
        assertEq(out, gross - gross * 2 / 10_000);
    }

    function test_routerFallsBackWhenQuoteExpired() public {
        _quote();
        vm.roll(block.number + 5);
        uint256 before = usdc.balanceOf(alice);
        uint256 out = _swapAs(router, alice, address(whype), address(usdc), 1 ether, 0, alice, ref);
        uint256 gross = 39e6;
        assertEq(out, gross - gross * 2 / 10_000);
        assertEq(usdc.balanceOf(alice) - before, out);
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function test_routerPicksFallbackWhenBetter() public {
        _quote();
        uni.setRate(41e6, 1e18); // fallback now beats the maker bid
        uint256 out = _swapAs(router, alice, address(whype), address(usdc), 1 ether, 0, alice, address(0));
        assertEq(out, 41e6 - 41e6 * 2 / 10_000);
    }

    function test_routerSkipsBrokenAdapter() public {
        _quote();
        uni.setBroken(true);
        _swapAs(router, alice, address(whype), address(usdc), 1 ether, 0, alice, address(0));
    }

    function test_routerNoRoute() public {
        vm.prank(gov);
        router.removeAdapter(address(uni));
        StoaRouter.SwapParams memory p = _params(router, address(whype), address(usdc), 1 ether, 0, alice, address(0));
        assertEq(p.leg1.venue, address(0), "no route quoted");
        vm.prank(alice);
        vm.expectRevert(StoaRouter.UnknownVenue.selector);
        router.swap(p);
    }

    function test_routerDeadline() public {
        _quote();
        StoaRouter.SwapParams memory p = _params(router, address(whype), address(usdc), 1 ether, 0, alice, address(0));
        p.deadline = block.timestamp - 1;
        vm.prank(alice);
        vm.expectRevert(StoaRouter.Expired.selector);
        router.swap(p);
    }

    function test_routerSlippageOnFallback() public {
        StoaRouter.SwapParams memory p =
            _params(router, address(whype), address(usdc), 1 ether, 39e6, alice, address(0));
        vm.prank(alice);
        vm.expectRevert(StoaRouter.Slippage.selector);
        router.swap(p);
    }

    // ------------------------------------------------------------ fees & referrals

    function test_referralGetsTenPercent() public {
        _quote();
        _swapAs(router, alice, address(usdc), address(whype), 400e6, 0, alice, ref);
        uint256 gross = 400e6 * 1e18 / ASK;
        uint256 fee = gross * 2 / 10_000;
        assertEq(fees.referralOwed(ref, address(whype)), fee / 10);
        assertEq(fees.protocolAccrued(address(whype)), fee - fee / 10);

        address[] memory toks = new address[](1);
        toks[0] = address(whype);
        vm.prank(ref);
        fees.claimReferral(toks, ref);
        assertEq(whype.balanceOf(ref), fee / 10);
    }

    function test_cannotNotifyUnbackedFees() public {
        vm.prank(address(pool));
        vm.expectRevert(FeeDistributor.Unbacked.selector);
        fees.notifyFee(address(usdc), 1e6, address(0));
    }

    function test_strangerCannotNotify() public {
        usdc.mint(address(fees), 1e6);
        vm.prank(alice);
        vm.expectRevert(FeeDistributor.NotAllowed.selector);
        fees.notifyFee(address(usdc), 1e6, alice);
    }

    function test_protocolWithdraw() public {
        _quote();
        vm.prank(alice);
        pool.swap(address(whype), 5 ether, 0, alice, address(0));
        uint256 acc = fees.protocolAccrued(address(usdc));
        vm.prank(gov);
        fees.withdrawProtocol(address(usdc), acc, treasury);
        assertEq(usdc.balanceOf(treasury), acc);
        vm.prank(gov);
        vm.expectRevert();
        fees.withdrawProtocol(address(usdc), 1, treasury);
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_poolNeverPaysMoreThanQuote(uint256 amtIn, bool sellBase) public {
        _quote();
        uint256 startW = whype.balanceOf(address(pool)) + whype.balanceOf(address(fees));
        uint256 startU = usdc.balanceOf(address(pool)) + usdc.balanceOf(address(fees));
        address tIn = sellBase ? address(whype) : address(usdc);
        amtIn = sellBase ? bound(amtIn, 1e9, 10 ether) : bound(amtIn, 1, 400e6);
        uint256 q = pool.quoteOut(tIn, amtIn);
        vm.prank(alice);
        try pool.swap(tIn, amtIn, 0, alice, address(0)) returns (uint256 out) {
            assertEq(out, q, "quoteOut matches swap");
            // value check at the maker's prices: pool + fees never lose value
            uint256 w = whype.balanceOf(address(pool)) + whype.balanceOf(address(fees));
            uint256 u = usdc.balanceOf(address(pool)) + usdc.balanceOf(address(fees));
            if (sellBase) {
                assertEq(w - startW, amtIn);
                assertLe((startU - u) * 1e18, amtIn * BID);
            } else {
                assertEq(u - startU, amtIn);
                assertLe((startW - w) * ASK, amtIn * 1e18);
            }
        } catch {
            assertEq(q, 0, "quoteOut is zero when swap fails");
        }
    }

    // ------------------------------------------------------------ Uniswap V2 adapter + native HYPE

    function _v2Setup() internal returns (MockV2Factory v2, MockToken meme) {
        v2 = new MockV2Factory();
        vm.deal(address(whype), 10_000 ether); // back minted WHYPE with native HYPE
        meme = new MockToken("MEME", 18);
        whype.mint(address(this), 1_100 ether);
        usdc.mint(address(this), 40_000e6);
        meme.mint(address(this), 1_000_000 ether);
        whype.approve(address(v2), type(uint256).max);
        usdc.approve(address(v2), type(uint256).max);
        meme.approve(address(v2), type(uint256).max);
        v2.addLiquidity(address(whype), address(usdc), 1_000 ether, 40_000e6); // HYPE = $40
        v2.addLiquidity(address(meme), address(whype), 1_000_000 ether, 100 ether); // launchpad-style HYPE pair
        UniswapV2Adapter ad = new UniswapV2Adapter(IUniswapV2Factory(address(v2)), address(whype), address(router));
        vm.startPrank(gov);
        router.removeAdapter(address(uni));
        router.addAdapter(address(ad));
        vm.stopPrank();
        meme.mint(alice, 10_000 ether);
        vm.prank(alice);
        meme.approve(address(router), type(uint256).max);
    }

    function test_v2_routesMemeToUsdcThroughHype() public {
        (MockV2Factory v2, MockToken meme) = _v2Setup();
        uint256 gross = v2.quote(address(whype), address(usdc), v2.quote(address(meme), address(whype), 1_000 ether));
        uint256 before = usdc.balanceOf(alice);
        uint256 out = _swapAs(router, alice, address(meme), address(usdc), 1_000 ether, 0, alice, ref);
        assertEq(out, gross - gross * 2 / 10_000);
        assertEq(usdc.balanceOf(alice) - before, out);
        assertEq(fees.referralOwed(ref, address(usdc)), (gross * 2 / 10_000) / 10);
    }

    function test_v2_nativeHypeIn() public {
        (, MockToken meme) = _v2Setup();
        vm.deal(alice, 5 ether);
        uint256 out = _swapAs(router, alice, address(0), address(meme), 1 ether, 1, alice, address(0));
        assertEq(meme.balanceOf(alice), 10_000 ether + out);
        assertGt(out, 9_000 ether); // ~9,870 MEME for 1 HYPE
    }

    function test_v2_nativeHypeOut() public {
        _v2Setup();
        address payable bob = payable(makeAddr("bob"));
        uint256 out = _swapAs(router, alice, address(usdc), address(0), 400e6, 0, bob, address(0));
        assertEq(bob.balance, out);
        assertGt(out, 9.8 ether);
        assertEq(address(router).balance, 0);
        assertEq(whype.balanceOf(address(router)), 0);
    }

    function test_v2_makerPoolStillWinsWhenBetter() public {
        _v2Setup();
        vm.prank(maker);
        pool.setQuote(BID, ASK, 10 ether, 10 ether, 2); // ask 40.10 vs V2 ~40.12+ incl. fee and impact
        _swapAs(router, alice, address(usdc), address(whype), 400e6, 0, alice, address(0));
        (,,, uint96 askSize,) = pool.current();
        assertLt(askSize, 10 ether); // filled by the Stoa pool
    }

    function test_hop_crossVenueUsesStoaPoolForSecondLeg() public {
        (MockV2Factory v2, MockToken meme) = _v2Setup();
        vm.prank(maker);
        pool.setQuote(41_000_000, 41_100_000, 10 ether, 10 ether, 2); // bid 41.00 beats V2 (~40)
        uint256 m = v2.quote(address(meme), address(whype), 1_000 ether);
        uint256 expected = pool.quoteOut(address(whype), m);

        StoaRouter.Quote memory q = router.quote(address(meme), address(usdc), 1_000 ether);
        assertEq(q.mid, address(whype));
        assertFalse(q.leg1.isPool);
        assertEq(q.leg2.venue, address(pool));
        assertTrue(q.leg2.isPool);
        assertEq(q.amountOut, expected);

        uint256 out = _swapAs(router, alice, address(meme), address(usdc), 1_000 ether, expected, alice, ref);
        assertEq(out, expected);
        // the fee is taken once, by the Stoa pool; the router adds nothing on top
        assertEq(fees.protocolAccrued(address(whype)), 0);
        assertEq(fees.referralOwed(ref, address(whype)), 0);
        assertGt(fees.referralOwed(ref, address(usdc)), 0);
        assertEq(whype.balanceOf(address(router)), 0);
        assertEq(meme.balanceOf(address(router)), 0);
    }

    function test_hop_twoAdapterLegsChargeOnce() public {
        (MockV2Factory v2, MockToken meme) = _v2Setup();
        StoaRouter.SwapParams memory p =
            _params(router, address(meme), address(usdc), 1_000 ether, 0, alice, address(0));
        // force the explicit two-leg route through WHYPE on the V2 adapter
        p.mid = address(whype);
        p.leg2 = p.leg1;
        uint256 gross = v2.quote(address(whype), address(usdc), v2.quote(address(meme), address(whype), 1_000 ether));
        vm.prank(alice);
        uint256 out = router.swap(p);
        assertEq(out, gross - gross * 2 / 10_000);
        assertEq(fees.protocolAccrued(address(whype)), 0, "no fee on the middle leg");
    }

    function test_v2_adapterOnlyRouter() public {
        _v2Setup();
        UniswapV2Adapter ad = UniswapV2Adapter(router.adapters(0));
        vm.expectRevert(UniswapV2Adapter.OnlyRouter.selector);
        ad.swap(address(usdc), address(whype), 1e6, 0, alice);
    }

    function test_routerRejectsStrayHype() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
    }
}
