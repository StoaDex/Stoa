// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {SpotlightMarket} from "../src/SpotlightMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TokenPackageRobinhood} from "../script/TokenPackageRobinhood.sol";

/// @notice Dress rehearsal of week 1 on the DEPLOYED SpotlightMarket (0xf3A9…06B5) and the live router: holders lock
///         before the week opens, four projects bid (one is canceled by the guardian, one misses the 1M vote quorum),
///         bids close after five days, the week settles, voters claim, losers and the canceled bid are refunded in
///         full, the keeper burns the pot as $STOA, and locks come back under the unlock rules.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodSpotlightLive -vv
contract ForkRobinhoodSpotlightLiveTest is Test, TokenPackageRobinhood {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    address constant GUARDIAN = 0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9;
    SpotlightMarket constant MKT = SpotlightMarket(payable(0xf3A995D4240c0F36da697E5292B294052a1706B5));
    uint256 constant M = 1_000_000 ether;
    // tokens from the app's Robinhood Chain list (routable, safety check passed on 19 Nov 2026)
    address constant ANT = 0x36C2861a1F94C6F277A388338A4F8A686e0d9B30;
    address constant HOOKR = 0x18E674231A58c239Dc7DaeDcffE15Ec3A24cff5c;
    address constant ORBIO = 0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3;
    address constant VRAX = 0x94641b97010608C3827fB058074889f19868FF33;

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    IERC20 stoa = IERC20(STOA);
    address h1 = makeAddr("h1");
    address h2 = makeAddr("h2");
    address h3 = makeAddr("h3");
    address p1 = makeAddr("p1");
    address p2 = makeAddr("p2");
    address p3 = makeAddr("p3");
    address p4 = makeAddr("p4");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        deal(STOA, h1, 6 * M);
        deal(STOA, h2, 2 * M);
        deal(STOA, h3, M / 2);
        vm.deal(p1, 1 ether);
        vm.deal(p2, 1 ether);
        vm.deal(p3, 1 ether);
        vm.deal(p4, 1 ether);
    }

    function _lock(address h, uint256 amt) internal {
        vm.startPrank(h);
        stoa.approve(address(MKT), amt);
        MKT.lock(amt);
        vm.stopPrank();
    }

    function _vote(address h, address t, uint256 amt) internal {
        address[] memory ts = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        (ts[0], as_[0]) = (t, amt);
        vm.prank(h);
        MKT.vote(ts, as_);
    }

    function test_fork_week1DressRehearsal() public {
        if (!on) return vm.skip(true);
        // the deployment the app and the weekly job use
        assertEq(MKT.owner(), LIVE_TIMELOCK, "owner: timelock");
        assertEq(MKT.keeper(), KEEPER, "keeper");
        assertEq(MKT.guardian(), GUARDIAN, "guardian");
        assertEq(address(MKT.router()), LIVE_ROUTER, "router");
        assertEq(address(MKT.stoa()), STOA, "stoa");
        assertFalse(MKT.paused(), "not paused");
        uint256 start = MKT.start();
        assertEq(start, 1795392000, "Mon 23 Nov 2026 07:00 WIB");
        assertFalse(MKT.started());

        // before the week opens: locks work, bids do not
        _lock(h1, 6 * M);
        _lock(h2, 2 * M);
        _lock(h3, M / 2);
        vm.expectRevert();
        vm.prank(p1);
        MKT.bid{value: 0.05 ether}(ANT);

        // week 1 opens
        vm.warp(start);
        assertEq(MKT.currentEpoch(), 0);
        assertEq(MKT.entryFeeFor(0), 0.001 ether);
        vm.prank(p1);
        MKT.bid{value: 0.201 ether}(ANT); // 0.2 ETH bid + entry fee
        vm.prank(p2);
        MKT.bid{value: 0.101 ether}(HOOKR);
        vm.prank(p3);
        MKT.bid{value: 0.051 ether}(ORBIO);
        vm.prank(p4);
        MKT.bid{value: 0.301 ether}(VRAX); // the largest bid, then canceled
        vm.expectRevert(); // below the 0.01 ETH minimum first bid
        vm.prank(p1);
        MKT.bid{value: 0.005 ether}(makeAddr("tiny"));

        vm.prank(GUARDIAN);
        MKT.cancel(VRAX);

        _vote(h1, ANT, 4 * M);
        _vote(h2, HOOKR, 2 * M);
        _vote(h3, ORBIO, M / 2); // under the 1M quorum: cannot win
        vm.prank(h1); // h1 splits: 4M on ANT, 2M on HOOKR
        {
            address[] memory ts = new address[](2);
            uint256[] memory as_ = new uint256[](2);
            (ts[0], as_[0], ts[1], as_[1]) = (ANT, 4 * M, HOOKR, 2 * M);
            MKT.vote(ts, as_);
        }

        // Saturday 07:00 WIB: bids close, votes go on
        vm.warp(start + 5 days);
        vm.expectRevert();
        vm.prank(p1);
        MKT.bid{value: 0.05 ether}(ANT);
        vm.expectRevert();
        vm.prank(GUARDIAN);
        MKT.cancel(ANT);

        // Monday 07:00 WIB: the week closes; what the weekly job does
        vm.warp(start + 7 days);
        address[] memory w = MKT.finalize(0);
        assertEq(w.length, 2, "two tokens met the quorum");
        assertEq(w[0], ANT, "largest bid first");
        assertEq(w[1], HOOKR);

        // voters: 90% of each winning bid, pro rata to votes
        uint256 b1 = h1.balance;
        vm.prank(h1);
        MKT.claim(0, ANT, h1);
        vm.prank(h1);
        MKT.claim(0, HOOKR, h1);
        uint256 b2 = h2.balance;
        vm.prank(h2);
        MKT.claim(0, HOOKR, h2);
        assertEq(h1.balance - b1, 0.18 ether + 0.045 ether, "all of ANT's 90% plus half of HOOKR's (2M of 4M votes)");
        assertEq(h2.balance - b2, 0.045 ether, "half of HOOKR's 90%");
        assertEq(MKT.claimable(0, ORBIO, h3), 0, "a token under quorum pays nothing");

        // losers and the canceled bid get everything back but the entry fee
        uint256 r3 = p3.balance;
        vm.prank(p3);
        MKT.refund(0, ORBIO, p3);
        assertEq(p3.balance - r3, 0.05 ether, "ORBIO refunded in full");
        uint256 r4 = p4.balance;
        vm.prank(p4);
        MKT.refund(0, VRAX, p4);
        assertEq(p4.balance - r4, 0.3 ether, "canceled VRAX refunded in full");
        vm.expectRevert();
        vm.prank(p1);
        MKT.refund(0, ANT, p1);

        // the pot: four entry fees + 10% of the two winning bids, burned as $STOA through the live router
        uint256 pot = MKT.burnPot();
        assertEq(pot, 0.004 ether + 0.02 ether + 0.01 ether, "entry fees + 10% cut");
        StoaRouter.Quote memory q = router.quote(address(0), STOA, pot);
        assertGt(q.amountOut, 0, "live route to $STOA");
        uint256 before = stoa.balanceOf(BURN);
        vm.prank(KEEPER);
        uint256 burned = MKT.burn(q.mid, q.leg1, q.leg2, q.amountOut * 98 / 100);
        console2.log("pot (wei) / $STOA burned", pot, burned / 1e18);
        assertEq(stoa.balanceOf(BURN) - before, burned);
        assertEq(MKT.burnPot(), 0);

        // only dust (rounding) is left in the contract
        assertLe(address(MKT).balance, 1e6, "every wei paid out but rounding");

        // locks: $STOA that voted in week 1 can be requested from week 2 and taken out when week 2 ends
        vm.prank(h3);
        MKT.requestUnlock(M / 2);
        vm.warp(start + 14 days);
        vm.prank(h3);
        MKT.withdraw(h3);
        assertEq(stoa.balanceOf(h3), M / 2, "h3 has its $STOA back");
    }
}
