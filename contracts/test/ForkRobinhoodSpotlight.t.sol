// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {SpotlightMarket} from "../src/SpotlightMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TokenPackageRobinhood} from "../script/TokenPackageRobinhood.sol";

/// @notice SpotlightMarket against the LIVE Robinhood Chain router and real $STOA: holders lock real $STOA, projects
///         bid real ETH, the week settles, voters claim, and the burn pot buys $STOA from its Uniswap V4 graduation
///         pool through the live router and sends it to 0x...dEaD.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodSpotlight -vv
contract ForkRobinhoodSpotlightTest is Test, TokenPackageRobinhood {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    address constant GUARDIAN = 0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9;
    address constant MRDN = 0x6437614eA1efBa0eB4b43bC1aF53808722B1Cf13;
    uint256 constant M = 1_000_000 ether;

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    IERC20 stoa = IERC20(STOA);
    SpotlightMarket mkt;
    address h1 = makeAddr("h1");
    address h2 = makeAddr("h2");
    address proj = makeAddr("proj");
    bool on;
    uint256 start;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        start = block.timestamp + 1 hours;
        mkt = new SpotlightMarket(
            LIVE_TIMELOCK,
            router,
            stoa,
            GUARDIAN,
            KEEPER,
            start,
            SpotlightMarket.Params({
                slots: 3, cutBps: 1000, entryFee: 0.001 ether, minBid: 0.01 ether, maxBid: 0.5 ether, quorum: uint128(M)
            })
        );
        deal(STOA, h1, 6 * M);
        deal(STOA, h2, 2 * M);
        vm.deal(proj, 1 ether);
    }

    function test_fork_weekSettlesAndBurnsRealStoa() public {
        if (!on) return vm.skip(true);
        vm.startPrank(h1);
        stoa.approve(address(mkt), type(uint256).max);
        mkt.lock(6 * M);
        vm.stopPrank();
        vm.startPrank(h2);
        stoa.approve(address(mkt), type(uint256).max);
        mkt.lock(2 * M);
        vm.stopPrank();

        vm.warp(start);
        vm.prank(proj);
        mkt.bid{value: 0.101 ether}(MRDN);
        address[] memory ts = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ts[0] = MRDN;
        as_[0] = 6 * M;
        vm.prank(h1);
        mkt.vote(ts, as_);
        as_[0] = 2 * M;
        vm.prank(h2);
        mkt.vote(ts, as_);

        vm.warp(start + 7 days);
        address[] memory w = mkt.finalize(0);
        assertEq(w.length, 1);
        assertEq(w[0], MRDN);

        uint256 b = h1.balance;
        vm.prank(h1);
        mkt.claim(0, MRDN, h1);
        assertEq(h1.balance - b, 0.0675 ether, "6M of 8M votes, 90% of 0.1 ETH");
        vm.prank(h2);
        mkt.claim(0, MRDN, h2);

        uint256 pot = mkt.burnPot();
        assertEq(pot, 0.011 ether, "entry fee + 10% cut");
        StoaRouter.Quote memory q = router.quote(address(0), STOA, pot);
        assertGt(q.amountOut, 0, "live route to STOA");
        uint256 before = stoa.balanceOf(BURN);
        vm.prank(KEEPER);
        uint256 burned = mkt.burn(q.mid, q.leg1, q.leg2, q.amountOut * 99 / 100);
        console2.log("burned STOA", burned / 1e18);
        assertEq(stoa.balanceOf(BURN) - before, burned);
        assertGe(burned, q.amountOut * 99 / 100);
        assertEq(address(mkt).balance, 0);

        // locks come back after the unlock rules: votes were used in week 0, so request in week 1, out after it
        vm.warp(start + 8 days);
        vm.prank(h1);
        mkt.requestUnlock(6 * M);
        vm.warp(start + 14 days);
        vm.prank(h1);
        mkt.withdraw(h1);
        assertEq(stoa.balanceOf(h1), 6 * M);
    }
}
