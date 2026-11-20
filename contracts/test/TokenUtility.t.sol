// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RouterHelper} from "./utils/RouterHelper.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {StoaBuyback} from "../src/StoaBuyback.sol";
import {BondRegistry} from "../src/BondRegistry.sol";
import {StoaPoolL2} from "../src/StoaPoolL2.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2} from "./mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev ArbSys stand-in with a settable block number
contract ArbSysClock {
    uint256 public bn = 1_000;

    function arbBlockNumber() external view returns (uint256) {
        return bn;
    }

    function set(uint256 b) external {
        bn = b;
    }
}

/// @dev token that keeps 1% of every transfer
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("FOT", "FOT") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 cut = value / 100;
            super._update(from, address(0xFEE), cut);
            value -= cut;
        }
        super._update(from, to, value);
    }
}

/// @notice $STOA utility: protocol fees buy and burn $STOA (StoaBuyback), and makers bond $STOA (BondRegistry) to quote
///         the Orbit maker pool (StoaPoolL2).
contract TokenUtilityTest is RouterHelper {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;

    MakerRegistry reg;
    FeeDistributor fees;
    StoaRouter router;
    StoaBuyback buyback;
    MockWHYPE weth;
    MockToken usdg;
    MockToken stoa;
    MockAdapter uni;

    address gov = makeAddr("gov");
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");
    address ref = makeAddr("ref");
    address stranger = makeAddr("stranger");

    function setUp() public {
        weth = new MockWHYPE();
        usdg = new MockToken("USDG", 6);
        stoa = new MockToken("STOA", 18);
        reg = new MakerRegistry(gov, gov, 3 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        uni = new MockAdapter(2, 1); // 1 in -> 2 out, any pair
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();
        weth.mint(address(uni), 1_000_000 ether);
        usdg.mint(address(uni), 1_000_000e6);
        stoa.mint(address(uni), 1_000_000_000 ether);

        buyback = new StoaBuyback(gov, fees, router, IERC20(address(stoa)), keeper);
        // the timelock hands the FeeDistributor over in one operation
        vm.startPrank(gov);
        fees.transferOwnership(address(buyback));
        buyback.acceptFeeOwnership();
        vm.stopPrank();

        usdg.mint(alice, 100_000e6);
        vm.prank(alice);
        usdg.approve(address(router), type(uint256).max);
    }

    /// alice swaps USDG -> WETH with a referrer: the 2 bps fee (in WETH) accrues, 90% to the protocol
    function _trade(uint256 usdgIn) internal returns (uint256 accrued) {
        _swapAs(router, alice, address(usdg), address(weth), usdgIn, 0, alice, ref);
        accrued = fees.protocolAccrued(address(weth));
    }

    function _buyback(address token, uint256 amount, uint256 minOut) internal returns (uint256) {
        StoaRouter.Quote memory q = router.quote(token, address(stoa), amount);
        vm.prank(keeper);
        return buyback.buyback(token, amount, q.mid, q.leg1, q.leg2, minOut);
    }

    // ------------------------------------------------------------ buyback & burn

    function test_handoverMakesBuybackTheOwner() public view {
        assertEq(fees.owner(), address(buyback));
        assertEq(buyback.owner(), gov);
    }

    function test_feesBuyStoaAndBurnIt() public {
        uint256 acc = _trade(10_000e6);
        assertGt(acc, 0);
        uint256 refOwed = fees.referralOwed(ref, address(weth));
        uint256 burned = _buyback(address(weth), acc, 1);

        assertEq(fees.protocolAccrued(address(weth)), 0, "protocol fees used");
        assertEq(stoa.balanceOf(BURN), burned, "all bought STOA burned");
        assertEq(buyback.totalBurned(), burned);
        assertEq(stoa.balanceOf(address(buyback)), 0);
        assertEq(weth.balanceOf(address(buyback)), 0, "nothing left behind");
        assertEq(fees.referralOwed(ref, address(weth)), refOwed, "referral earnings untouched");
        // the buyback swap paid the router fee in STOA: the next run burns it without a swap
        uint256 stoaFee = fees.protocolAccrued(address(stoa));
        assertGt(stoaFee, 0);
        uint256 more = _buyback(address(stoa), stoaFee, 0);
        assertEq(more, stoaFee);
        assertEq(stoa.balanceOf(BURN), burned + stoaFee);
    }

    function test_partialAmountAndReferralsStillClaimable() public {
        uint256 acc = _trade(10_000e6);
        _buyback(address(weth), acc / 2, 1);
        assertEq(fees.protocolAccrued(address(weth)), acc - acc / 2);
        address[] memory t = new address[](1);
        t[0] = address(weth);
        vm.prank(ref);
        fees.claimReferral(t, ref);
        assertGt(weth.balanceOf(ref), 0, "referrer still claims");
    }

    function test_onlyKeeperOrOwner() public {
        uint256 acc = _trade(1_000e6);
        StoaRouter.Quote memory q = router.quote(address(weth), address(stoa), acc);
        vm.prank(stranger);
        vm.expectRevert(StoaBuyback.NotKeeper.selector);
        buyback.buyback(address(weth), acc, q.mid, q.leg1, q.leg2, 0);
        vm.prank(gov);
        buyback.buyback(address(weth), acc, q.mid, q.leg1, q.leg2, 0);
    }

    function test_minOutProtectsTheSwap() public {
        uint256 acc = _trade(1_000e6);
        StoaRouter.Quote memory q = router.quote(address(weth), address(stoa), acc);
        vm.prank(keeper);
        vm.expectRevert(StoaRouter.Slippage.selector);
        buyback.buyback(address(weth), acc, q.mid, q.leg1, q.leg2, q.amountOut + 1);
        assertEq(fees.protocolAccrued(address(weth)), acc, "fees stay put on a failed run");
    }

    function test_feesCannotBeWithdrawnAnyOtherWay() public {
        uint256 acc = _trade(1_000e6);
        vm.prank(gov);
        vm.expectRevert(StoaBuyback.NotAllowed.selector);
        buyback.exec(abi.encodeCall(FeeDistributor.withdrawProtocol, (address(weth), acc, gov)));
        vm.prank(gov);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, gov));
        fees.withdrawProtocol(address(weth), acc, gov);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        buyback.exec(abi.encodeCall(FeeDistributor.setReferralBps, (2_000)));
    }

    function test_ownerKeepsOtherSettingsAndCanHandBack() public {
        vm.startPrank(gov);
        buyback.exec(abi.encodeCall(FeeDistributor.setReferralBps, (2_000)));
        buyback.exec(abi.encodeCall(FeeDistributor.setNotifier, (stranger, true)));
        buyback.exec(abi.encodeWithSignature("transferOwnership(address)", gov));
        fees.acceptOwnership();
        vm.stopPrank();
        assertEq(fees.referralBps(), 2_000);
        assertTrue(fees.isNotifier(stranger));
        assertEq(fees.owner(), gov, "policy can change, but only through the owner (timelock)");
    }

    function test_keeperChangeOnlyByOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        buyback.setKeeper(stranger);
        vm.prank(gov);
        buyback.setKeeper(stranger);
        assertEq(buyback.keeper(), stranger);
    }

    // ------------------------------------------------------------ $STOA maker bonds

    function _bondSetup() internal returns (BondRegistry b, StoaPoolL2 pool, ArbSysClock clock, address maker) {
        clock = new ArbSysClock();
        vm.etch(address(0x64), address(clock).code);
        clock = ArbSysClock(address(0x64));
        b = new BondRegistry(gov, IERC20(address(stoa)), 3 days);
        pool = new StoaPoolL2(
            address(weth), address(usdg), IMakerRegistry(address(b)), IFeeDistributor(address(fees)), gov, 500e6
        );
        maker = makeAddr("maker");
        stoa.mint(maker, 2_000_000 ether);
        vm.prank(maker);
        stoa.approve(address(b), type(uint256).max);
        vm.startPrank(gov);
        b.listPool(address(pool), 1_000_000 ether);
        b.setMakerApproval(address(pool), maker, true);
        // pools on the bond registry are not in the FeeDistributor's original registry: the owner lists them as notifiers
        buyback.exec(abi.encodeCall(FeeDistributor.setNotifier, (address(pool), true)));
        vm.stopPrank();
        weth.mint(address(pool), 10 ether);
        usdg.mint(address(pool), 20_000e6);
    }

    function test_makerNeedsBondAndApproval() public {
        (BondRegistry b, StoaPoolL2 pool,, address maker) = _bondSetup();
        assertFalse(b.isActiveMaker(address(pool), maker), "no bond yet");
        vm.prank(maker);
        vm.expectRevert(StoaPoolL2.NotMaker.selector);
        pool.setQuote(1_990e6, 2_010e6, 1 ether, 1 ether, 2);

        vm.prank(maker);
        b.bond(1_000_000 ether);
        assertTrue(b.isActiveMaker(address(pool), maker));
        assertEq(b.totalBonded(), 1_000_000 ether);
        assertEq(stoa.balanceOf(address(b)), 1_000_000 ether);

        vm.prank(gov);
        b.setMakerApproval(address(pool), maker, false);
        assertFalse(b.isActiveMaker(address(pool), maker), "approval revoked");
    }

    function test_poolL2QuotesExpireByChainBlocks() public {
        (BondRegistry b, StoaPoolL2 pool, ArbSysClock clock, address maker) = _bondSetup();
        vm.startPrank(maker);
        b.bond(1_000_000 ether);
        pool.setQuote(1_990e6, 2_010e6, 1 ether, 1 ether, 2);
        vm.stopPrank();
        assertGt(pool.quoteOut(address(weth), 0.1 ether), 0);
        // parent-chain block.number does not matter; the chain's own blocks do
        vm.roll(block.number + 100);
        assertGt(pool.quoteOut(address(weth), 0.1 ether), 0, "still valid: same chain block");
        clock.set(clock.bn() + 2);
        assertEq(pool.quoteOut(address(weth), 0.1 ether), 0, "expired after 2 chain blocks");
    }

    function test_poolL2FillsThroughRouterAndPaysFees() public {
        (BondRegistry b, StoaPoolL2 pool,, address maker) = _bondSetup();
        vm.startPrank(maker);
        b.bond(1_000_000 ether);
        pool.setQuote(1_990e6, 2_010e6, 1 ether, 1 ether, 2);
        vm.stopPrank();
        vm.prank(gov);
        router.addPool(address(pool));
        // 402 USDG (under the $500 per-swap cap) buys 0.2 WETH at the maker's ask; price the fallback venue out
        uni.setRate(1, 1e9);
        uint256 out = _swapAs(router, alice, address(usdg), address(weth), 402e6, 0, alice, address(0));
        assertEq(out, 0.2 ether - 0.2 ether * 2 / 10_000, "filled by the maker pool at the ask, minus 2 bps");
        assertGt(fees.protocolAccrued(address(weth)), 0, "pool fee reached the FeeDistributor");
    }

    function test_unbondDelayAndWithdraw() public {
        (BondRegistry b, StoaPoolL2 pool,, address maker) = _bondSetup();
        vm.startPrank(maker);
        b.bond(1_500_000 ether);
        b.requestUnbond(600_000 ether);
        vm.stopPrank();
        assertFalse(b.isActiveMaker(address(pool), maker), "below the pool minimum");
        vm.prank(maker);
        vm.expectRevert(BondRegistry.StillLocked.selector);
        b.withdrawUnbonded();
        vm.warp(block.timestamp + 3 days);
        uint256 before = stoa.balanceOf(maker);
        vm.prank(maker);
        b.withdrawUnbonded();
        assertEq(stoa.balanceOf(maker) - before, 600_000 ether);
        assertEq(b.totalBonded(), 900_000 ether);
    }

    function test_slashBurnsBond() public {
        (BondRegistry b,,, address maker) = _bondSetup();
        vm.startPrank(maker);
        b.bond(1_000_000 ether);
        b.requestUnbond(400_000 ether);
        vm.stopPrank();
        uint256 burn0 = stoa.balanceOf(BURN);
        vm.prank(gov);
        b.slash(maker, 700_000 ether); // 600k active + 100k pending
        (uint128 active, uint128 pending,) = b.bonds(maker);
        assertEq(active, 0);
        assertEq(pending, 300_000 ether);
        assertEq(stoa.balanceOf(BURN) - burn0, 700_000 ether, "slashed STOA burned");
        assertEq(b.totalSlashed(), 700_000 ether);
        assertEq(b.totalBonded(), 300_000 ether);
        vm.prank(gov);
        vm.expectRevert(BondRegistry.InsufficientBond.selector);
        b.slash(maker, 300_000 ether + 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        b.slash(maker, 1);
    }

    function test_feeOnTransferBondTokenRefused() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        BondRegistry b = new BondRegistry(gov, IERC20(address(fot)), 3 days);
        fot.mint(alice, 100 ether);
        vm.startPrank(alice);
        fot.approve(address(b), type(uint256).max);
        vm.expectRevert(BondRegistry.UnsupportedToken.selector);
        b.bond(10 ether);
        vm.stopPrank();
    }

    function test_bondGuards() public {
        (BondRegistry b,,, address maker) = _bondSetup();
        vm.startPrank(maker);
        vm.expectRevert(BondRegistry.ZeroAmount.selector);
        b.bond(0);
        vm.expectRevert(BondRegistry.InsufficientBond.selector);
        b.requestUnbond(1);
        vm.expectRevert(BondRegistry.ZeroAmount.selector);
        b.withdrawUnbonded();
        vm.stopPrank();
        stoa.mint(maker, uint256(type(uint128).max));
        vm.prank(maker);
        vm.expectRevert(BondRegistry.TooLarge.selector);
        b.bond(uint256(type(uint128).max) + 1);
        vm.prank(gov);
        vm.expectRevert(BondRegistry.DelayTooLong.selector);
        b.setUnbondDelay(31 days);
    }

    function testFuzz_bondAccounting(uint96 a, uint96 u, uint96 s) public {
        (BondRegistry b,,, address maker) = _bondSetup();
        uint256 amt = bound(uint256(a), 1, 2_000_000 ether);
        uint256 unb = bound(uint256(u), 0, amt);
        vm.startPrank(maker);
        b.bond(amt);
        if (unb > 0) b.requestUnbond(unb);
        vm.stopPrank();
        uint256 sl = bound(uint256(s), 1, amt);
        vm.prank(gov);
        b.slash(maker, sl);
        (uint128 active, uint128 pending,) = b.bonds(maker);
        assertEq(uint256(active) + pending, amt - sl);
        assertEq(b.totalBonded(), amt - sl);
        assertEq(stoa.balanceOf(address(b)), b.totalBonded(), "registry holds exactly what it owes");
    }
}
