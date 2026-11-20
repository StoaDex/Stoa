// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {StoaLimitV2 as StoaLimit} from "../src/StoaLimitV2.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2, TaxToken} from "./mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev a maker contract whose refund tries to take a second refund
contract GreedyMakerV2 {
    StoaLimit lim;
    uint256 id;
    bool tried;

    constructor(StoaLimit l) {
        lim = l;
    }

    function place(address tokenOut, uint256 minOut) external payable {
        id = lim.create{value: msg.value}(
            address(0), tokenOut, msg.value, minOut, uint64(block.timestamp + 1 days), address(0)
        );
    }

    function cancelIt() external {
        lim.cancel(id);
    }

    receive() external payable {
        if (!tried) {
            tried = true;
            lim.cancel(id);
        }
    }
}

/// @notice The whole StoaLimit suite, run against StoaLimitV2, plus the dust-order case it fixes.
contract StoaLimitV2Test is Test {
    address constant NATIVE = address(0);
    StoaLimit lim;
    StoaRouter router;
    FeeDistributor fees;
    MockWHYPE weth;
    MockToken tok;
    MockAdapter buyAd; // 1 ETH -> 1000 TOK
    MockAdapter sellAd; // 1000 TOK -> 1 WETH

    address gov = makeAddr("gov");
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address ref = makeAddr("ref");
    address stranger = makeAddr("stranger");

    StoaRouter.Leg none;

    function setUp() public {
        vm.warp(1_795_000_000);
        weth = new MockWHYPE();
        tok = new MockToken("TOK", 18);
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        buyAd = new MockAdapter(1000, 1);
        sellAd = new MockAdapter(1, 1000);
        vm.startPrank(gov);
        router.addAdapter(address(buyAd));
        router.addAdapter(address(sellAd));
        fees.setNotifier(address(router), true);
        vm.stopPrank();
        tok.mint(address(buyAd), 1_000_000 ether);
        weth.mint(address(sellAd), 1_000 ether);
        vm.deal(address(weth), 1_000 ether); // backs the minted WETH so the router can unwrap it
        lim = new StoaLimit(gov, router, guardian, keeper);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        tok.mint(alice, 100_000 ether);
        tok.mint(bob, 100_000 ether);
    }

    function _leg(MockAdapter a) internal pure returns (StoaRouter.Leg memory) {
        return StoaRouter.Leg({venue: address(a), isPool: false});
    }

    function _buy(address maker, uint256 eth, uint256 minOut) internal returns (uint256 id) {
        vm.prank(maker);
        id = lim.create{value: eth}(NATIVE, address(tok), eth, minOut, uint64(block.timestamp + 1 days), ref);
    }

    function _sell(address maker, uint256 amt, uint256 minOut) internal returns (uint256 id) {
        vm.startPrank(maker);
        tok.approve(address(lim), amt);
        id = lim.create(address(tok), NATIVE, amt, minOut, uint64(block.timestamp + 1 days), address(0));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- fills

    function test_buyOrder_filledByKeeper_paysMakerAtLeastMin() public {
        uint256 id = _buy(alice, 1 ether, 990 ether);
        assertEq(address(lim).balance, 1 ether);
        uint256 t0 = tok.balanceOf(alice);
        vm.prank(keeper);
        uint256 out = lim.fill(id, NATIVE, _leg(buyAd), none);
        assertGe(out, 990 ether);
        assertEq(tok.balanceOf(alice) - t0, out);
        assertEq(address(lim).balance, 0);
        assertEq(lim.order(id).status, lim.FILLED());
        assertEq(lim.openLength(), 0);
        assertEq(lim.openCount(alice), 0);
        // the order's referrer earned its share of the router fee
        assertGt(fees.referralOwed(ref, address(tok)), 0);
    }

    function test_fill_belowMinimum_reverts_orderStaysOpen() public {
        uint256 id = _buy(alice, 1 ether, 1001 ether); // more than the market pays
        vm.prank(keeper);
        vm.expectRevert(StoaRouter.Slippage.selector);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        assertEq(lim.order(id).status, lim.OPEN());
        assertEq(address(lim).balance, 1 ether);
        // the market moves up: now it fills
        buyAd.setRate(1100, 1);
        tok.mint(address(buyAd), 1_000_000 ether);
        vm.prank(keeper);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        assertGe(tok.balanceOf(alice), 100_000 ether + 1001 ether);
    }

    function test_sellOrder_paysMakerGasToken() public {
        uint256 id = _sell(alice, 1000 ether, 0.99 ether);
        assertEq(tok.balanceOf(address(lim)), 1000 ether);
        uint256 e0 = alice.balance;
        vm.prank(keeper);
        uint256 out = lim.fill(id, NATIVE, _leg(sellAd), none);
        assertGe(out, 0.99 ether);
        assertEq(alice.balance - e0, out);
        assertEq(tok.balanceOf(address(lim)), 0);
        assertEq(tok.allowance(address(lim), address(router)), 0);
    }

    function test_makerCanFillOwnOrder_strangerCannot() public {
        uint256 id = _buy(alice, 1 ether, 900 ether);
        vm.prank(stranger);
        vm.expectRevert(StoaLimit.NotAllowed.selector);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        vm.prank(alice);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        assertEq(lim.order(id).status, lim.FILLED());
    }

    function test_keeperCannotRedirect_orUseUnknownVenue() public {
        uint256 id = _buy(alice, 1 ether, 900 ether);
        MockAdapter evil = new MockAdapter(1000, 1);
        vm.prank(keeper);
        vm.expectRevert(StoaRouter.UnknownVenue.selector);
        lim.fill(id, NATIVE, _leg(evil), none);
        // the only possible recipient is the maker
        vm.prank(keeper);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        assertEq(tok.balanceOf(keeper), 0);
    }

    function test_fill_afterExpiry_reverts_anyoneReturnsDeposit() public {
        uint256 id = _buy(alice, 1 ether, 900 ether);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(keeper);
        vm.expectRevert(StoaLimit.Expired.selector);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        uint256 e0 = alice.balance;
        vm.prank(stranger);
        lim.cancel(id);
        assertEq(alice.balance - e0, 1 ether);
        assertEq(stranger.balance, 0);
    }

    function test_fill_twice_reverts() public {
        uint256 id = _buy(alice, 1 ether, 900 ether);
        vm.startPrank(keeper);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        vm.expectRevert(StoaLimit.NotOpen.selector);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(StoaLimit.NotOpen.selector);
        lim.cancel(id);
    }

    // ---------------------------------------------------------------- cancels

    function test_cancel_returnsDeposits() public {
        uint256 a = _buy(alice, 2 ether, 1 ether);
        uint256 b = _sell(alice, 500 ether, 0.1 ether);
        uint256 e0 = alice.balance;
        uint256 t0 = tok.balanceOf(alice);
        vm.startPrank(alice);
        lim.cancel(a);
        lim.cancel(b);
        vm.stopPrank();
        assertEq(alice.balance - e0, 2 ether);
        assertEq(tok.balanceOf(alice) - t0, 500 ether);
        assertEq(address(lim).balance, 0);
        assertEq(tok.balanceOf(address(lim)), 0);
        assertEq(lim.openLength(), 0);
    }

    function test_cancel_byStranger_beforeExpiry_reverts() public {
        uint256 id = _buy(alice, 1 ether, 900 ether);
        vm.prank(stranger);
        vm.expectRevert(StoaLimit.NotAllowed.selector);
        lim.cancel(id);
        vm.prank(keeper);
        vm.expectRevert(StoaLimit.NotAllowed.selector);
        lim.cancel(id);
    }

    function test_reentrantRefund_cannotDoubleWithdraw() public {
        GreedyMakerV2 g = new GreedyMakerV2(lim);
        vm.deal(address(g), 0);
        g.place{value: 1 ether}(address(tok), 900 ether);
        _buy(bob, 3 ether, 900 ether); // other people's deposits in the contract
        vm.expectRevert(StoaLimit.SendFailed.selector);
        g.cancelIt();
        assertEq(address(lim).balance, 4 ether);
    }

    // ---------------------------------------------------------------- pause and admin

    function test_pause_stopsCreateAndFill_notCancel() public {
        uint256 id = _buy(alice, 1 ether, 900 ether);
        vm.prank(guardian);
        lim.pause();
        vm.prank(alice);
        vm.expectRevert(StoaLimit.IsPaused.selector);
        lim.create{value: 1 ether}(NATIVE, address(tok), 1 ether, 1, uint64(block.timestamp + 1 hours), address(0));
        vm.prank(keeper);
        vm.expectRevert(StoaLimit.IsPaused.selector);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        vm.prank(alice);
        lim.cancel(id);
        assertEq(lim.order(id).status, lim.CANCELLED());
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        lim.unpause();
        vm.prank(gov);
        lim.unpause();
        assertFalse(lim.paused());
    }

    function test_admin() public {
        vm.prank(stranger);
        vm.expectRevert(StoaLimit.NotGuardian.selector);
        lim.pause();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        lim.setKeeper(stranger);
        vm.prank(gov);
        lim.setKeeper(bob);
        assertEq(lim.keeper(), bob);
        vm.prank(gov);
        vm.expectRevert(StoaLimit.ZeroAddress.selector);
        lim.setGuardian(address(0));
        vm.prank(gov);
        vm.expectRevert(StoaLimit.NoRenounce.selector);
        lim.renounceOwnership();
    }

    // ---------------------------------------------------------------- input checks

    function test_create_checks() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        vm.startPrank(alice);
        vm.expectRevert(StoaLimit.BadOrder.selector);
        lim.create{value: 1 ether}(NATIVE, NATIVE, 1 ether, 1, exp, address(0));
        vm.expectRevert(StoaLimit.BadOrder.selector);
        lim.create{value: 1 ether}(NATIVE, address(tok), 1 ether, 0, exp, address(0));
        vm.expectRevert(StoaLimit.BadOrder.selector);
        lim.create{value: 1 ether}(NATIVE, address(tok), 1 ether, 1, uint64(block.timestamp), address(0));
        vm.expectRevert(StoaLimit.BadOrder.selector);
        lim.create{value: 1 ether}(NATIVE, address(tok), 1 ether, 1, uint64(block.timestamp + 31 days), address(0));
        vm.expectRevert(StoaLimit.BadValue.selector);
        lim.create{value: 0.5 ether}(NATIVE, address(tok), 1 ether, 1, exp, address(0));
        tok.approve(address(lim), 1 ether);
        vm.expectRevert(StoaLimit.BadValue.selector);
        lim.create{value: 1}(address(tok), NATIVE, 1 ether, 1, exp, address(0));
        vm.stopPrank();
    }

    function test_feeOnTransferToken_refused() public {
        TaxToken tax = new TaxToken();
        tax.mint(alice, 100 ether);
        vm.startPrank(alice);
        tax.approve(address(lim), 100 ether);
        vm.expectRevert(StoaLimit.BadToken.selector);
        lim.create(address(tax), NATIVE, 100 ether, 1, uint64(block.timestamp + 1 days), address(0));
        vm.stopPrank();
    }

    function test_perMakerCap() public {
        for (uint256 i; i < 20; ++i) {
            _buy(alice, 0.01 ether, 1);
        }
        vm.prank(alice);
        vm.expectRevert(StoaLimit.TooMany.selector);
        lim.create{value: 0.01 ether}(NATIVE, address(tok), 0.01 ether, 1, uint64(block.timestamp + 1 days), address(0));
        // closing one frees a slot
        uint256[] memory mine = lim.ordersOf(alice);
        vm.prank(alice);
        lim.cancel(mine[3]);
        _buy(alice, 0.01 ether, 1);
        assertEq(lim.openCount(alice), 20);
    }

    // ---------------------------------------------------------------- dust (reported by Hey Research Lab)

    /// @dev 1,000 one-wei orders from 50 fresh makers that can never fill no longer block anyone: there is no cap on
    ///      open orders across makers, only the per-maker one.
    function test_dustOrdersFromManyMakers_doNotBlockNewOrders() public {
        uint64 expiry = uint64(block.timestamp + lim.MAX_TTL());
        for (uint256 m; m < 50; ++m) {
            address a = address(uint160(0xD000 + m));
            vm.deal(a, 21);
            vm.startPrank(a);
            for (uint256 i; i < 20; ++i) {
                lim.create{value: 1}(NATIVE, address(tok), 1, type(uint256).max, expiry, address(0));
            }
            vm.expectRevert(StoaLimit.TooMany.selector); // the per-maker cap still holds
            lim.create{value: 1}(NATIVE, address(tok), 1, type(uint256).max, expiry, address(0));
            vm.stopPrank();
        }
        assertEq(lim.openLength(), 1000);
        uint256 id = _buy(alice, 1 ether, 900 ether);
        assertEq(lim.openLength(), 1001);
        vm.prank(keeper);
        lim.fill(id, NATIVE, _leg(buyAd), none);
        assertGe(tok.balanceOf(alice), 100_000 ether + 900 ether, "a real order still fills, at least its minimum");
        // the keeper pages through the book
        assertEq(lim.openIds(0, 600).length, 600);
        assertEq(lim.openIds(600, 600).length, 400);
    }

    // ---------------------------------------------------------------- invariants

    /// @dev random creates, fills and cancels: the contract always holds exactly the deposits of open orders, and the
    ///      open list holds exactly the open orders
    function testFuzz_depositsMatchOpenOrders(uint256 seed) public {
        uint256[] memory ids = new uint256[](24);
        uint256 n;
        for (uint256 step; step < 40; ++step) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 action = seed % 4;
            address who = seed % 7 < 4 ? alice : bob;
            if (action <= 1 || n == 0) {
                if (lim.openCount(who) >= 20) continue;
                uint256 amt = 0.01 ether + (seed % 1 ether);
                ids[n % 24] = (seed >> 8) % 2 == 0 ? _buy(who, amt, 1) : _sell(who, amt * 100, 1);
                ++n;
            } else {
                uint256 id = ids[(seed >> 16) % (n < 24 ? n : 24)];
                if (lim.order(id).status != lim.OPEN()) continue;
                StoaLimit.Order memory o = lim.order(id);
                if (action == 2) {
                    StoaRouter.Leg memory l = o.tokenIn == NATIVE ? _leg(buyAd) : _leg(sellAd);
                    vm.prank(keeper);
                    lim.fill(id, NATIVE, l, none);
                } else {
                    vm.prank(o.maker);
                    lim.cancel(id);
                }
            }
        }
        uint256 eth;
        uint256 toks;
        uint256 open;
        for (uint256 id = 1; id < lim.nextId(); ++id) {
            StoaLimit.Order memory o = lim.order(id);
            if (o.status != lim.OPEN()) continue;
            ++open;
            if (o.tokenIn == NATIVE) eth += o.amountIn;
            else toks += o.amountIn;
        }
        assertEq(address(lim).balance, eth);
        assertEq(tok.balanceOf(address(lim)), toks);
        assertEq(lim.openLength(), open);
        uint256[] memory listed = lim.openIds(0, 1000);
        assertEq(listed.length, open);
        for (uint256 i; i < listed.length; ++i) {
            assertEq(lim.order(listed[i]).status, lim.OPEN());
        }
        assertEq(lim.openCount(alice) + lim.openCount(bob), open);
    }
}
