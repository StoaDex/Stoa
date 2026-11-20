// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {StoaLimit} from "../src/StoaLimit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TokenPackageRobinhood} from "../script/TokenPackageRobinhood.sol";

/// @notice StoaLimit against the LIVE Robinhood Chain router: a buy order for USDG with ETH that waits below the
///         market, fills once its minimum is within reach, and a sell order of $STOA for ETH through its V4 pool.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodLimit -vv
contract ForkRobinhoodLimitTest is Test, TokenPackageRobinhood {
    address constant GUARDIAN = 0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NATIVE = address(0);
    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    StoaLimit lim;
    address maker = makeAddr("maker");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        lim = new StoaLimit(LIVE_TIMELOCK, router, GUARDIAN, KEEPER);
        vm.deal(maker, 10 ether);
    }

    function test_fork_buyAndSellOrders() public {
        if (!on) return;
        // buy: 0.01 ETH for USDG, 2% under the market, filled by the keeper along the router's own route
        StoaRouter.Quote memory q = router.quote(NATIVE, USDG, 0.01 ether);
        uint256 minOut = q.amountOut * 98 / 100;
        vm.prank(maker);
        uint256 id = lim.create{value: 0.01 ether}(
            NATIVE, USDG, 0.01 ether, minOut, uint64(block.timestamp + 1 days), address(0)
        );
        // an order above the market does not fill
        vm.prank(maker);
        uint256 high = lim.create{value: 0.01 ether}(
            NATIVE, USDG, 0.01 ether, q.amountOut * 2, uint64(block.timestamp + 1 days), address(0)
        );
        vm.prank(KEEPER);
        vm.expectRevert(StoaRouter.Slippage.selector);
        lim.fill(high, q.mid, q.leg1, q.leg2);

        uint256 u0 = IERC20(USDG).balanceOf(maker);
        vm.prank(KEEPER);
        uint256 out = lim.fill(id, q.mid, q.leg1, q.leg2);
        assertGe(out, minOut);
        assertEq(IERC20(USDG).balanceOf(maker) - u0, out);
        console2.log("buy filled, USDG out", out);

        // sell: everything the buy got, plus $STOA bought first, for ETH
        StoaRouter.Quote memory sq = router.quote(NATIVE, STOA, 0.005 ether);
        vm.prank(maker);
        router.swap{value: 0.005 ether}(
            StoaRouter.SwapParams(
                NATIVE, STOA, sq.mid, sq.leg1, sq.leg2, 0.005 ether, 1, maker, block.timestamp, address(0)
            )
        );
        uint256 stoaAmt = IERC20(STOA).balanceOf(maker);
        StoaRouter.Quote memory back = router.quote(STOA, NATIVE, stoaAmt);
        vm.startPrank(maker);
        IERC20(STOA).approve(address(lim), stoaAmt);
        uint256 sid =
            lim.create(STOA, NATIVE, stoaAmt, back.amountOut * 99 / 100, uint64(block.timestamp + 1 days), address(0));
        vm.stopPrank();
        uint256 e0 = maker.balance;
        vm.prank(KEEPER);
        uint256 got = lim.fill(sid, back.mid, back.leg1, back.leg2);
        assertGe(got, back.amountOut * 99 / 100);
        assertEq(maker.balance - e0, got);
        assertEq(IERC20(STOA).balanceOf(address(lim)), 0);
        console2.log("sell filled, ETH out", got);

        // the order left above the market goes back to its maker
        uint256 e1 = maker.balance;
        vm.prank(maker);
        lim.cancel(high);
        assertEq(maker.balance - e1, 0.01 ether);
        assertEq(address(lim).balance, 0);
    }
}
