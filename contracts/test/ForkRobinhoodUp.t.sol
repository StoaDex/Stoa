// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {CLTickSpacingAdapter, ICLTickSpacingFactory} from "../src/adapters/CLTickSpacingAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UpVenueRobinhood} from "../script/UpVenueRobinhood.sol";

/// @notice Robinhood Chain fork: the up. adapter quotes and fills through the live router once added (the router's
///         owner, the timelock, proposes and executes it here; the Safe -> timelock rounds are the same as for Aero and
///         Ramses, covered by ForkRobinhoodVenues). Skipped without ROBINHOOD_RPC_URL.
contract ForkRobinhoodUp is Test, UpVenueRobinhood {
    StoaRouter router = StoaRouter(payable(UP_LIVE_ROUTER));
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant UP = 0x57C0E45cB534413D1C20A4240955d6bB250BB4F1; // deepest up. WETH pool on 17 Nov 2026
    CLTickSpacingAdapter up;
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        up = new CLTickSpacingAdapter(ICLTickSpacingFactory(UP_CL_FACTORY), UP_LIVE_ROUTER, upSpacings());
        vm.deal(alice, 100 ether);
    }

    function test_fork_upQuotesLivePools() public {
        if (!on) return vm.skip(true);
        assertGt(up.quote(WETH, UP, 0.1 ether), 0, "WETH -> UP");
        assertGt(up.quote(WETH, USDG, 0.1 ether), 0, "WETH -> USDG");
        assertGt(up.quote(USDG, WETH, 100e6), 0, "USDG -> WETH");
    }

    function test_fork_routerAddsUpAndSwapsThroughIt() public {
        if (!on) return vm.skip(true);
        address owner = router.owner();
        vm.prank(owner);
        router.propose(false, address(up));
        vm.warp(block.timestamp + router.delay() + 1);
        vm.prank(owner);
        router.execute(false, address(up));
        assertTrue(router.isAdapter(address(up)));

        StoaRouter.Quote memory q = router.quote(address(0), UP, 0.5 ether);
        console2.log("router quote ETH -> UP (0.5 ETH)", q.amountOut);
        assertGt(q.amountOut, 0);
        uint256 b0 = IERC20(UP).balanceOf(alice);
        vm.prank(alice);
        router.swap{value: 0.5 ether}(
            StoaRouter.SwapParams({
                tokenIn: address(0),
                tokenOut: UP,
                mid: q.mid,
                leg1: q.leg1,
                leg2: q.leg2,
                amountIn: 0.5 ether,
                minOut: q.amountOut,
                to: alice,
                deadline: block.timestamp,
                referrer: address(0)
            })
        );
        assertGe(IERC20(UP).balanceOf(alice) - b0, q.amountOut);
    }
}
