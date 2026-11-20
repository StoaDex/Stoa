// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";
import {TokenPackageRobinhood} from "../script/TokenPackageRobinhood.sol";
import {V4AdapterV3Robinhood} from "../script/V4AdapterV3Robinhood.sol";

/// @notice Rehearsal of the UniswapV4AdapterV3 rollout on a Robinhood Chain fork, in the order the deploy workflow and
///         RolloutV4AdapterV3Robinhood.s.sol run it: deploy with the script's roles and allowlist, the keeper
///         registers the Stoa-owned pools, the timelock pins each one, the router swaps its V4 adapters for V3, and a
///         trader swaps ETH -> $STOA and ETH -> USDG through the router. Then the guardian's off switch. The Safe ->
///         timelock rounds are the same as the other rollouts (ForkRobinhoodVenues). Skipped without
///         ROBINHOOD_RPC_URL.
contract ForkRobinhoodV4V3Rollout is Test, TokenPackageRobinhood, V4AdapterV3Robinhood {
    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    UniswapV4AdapterV3 v3;
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        v3 = new UniswapV4AdapterV3(
            IPoolManager(V4_POOL_MANAGER), WETH, LIVE_ROUTER, LIVE_TIMELOCK, hooksV3(), KEEPER, V3_GUARDIAN
        );
        vm.deal(alice, 10 ether);
    }

    function _swapEth(address tokenOut, uint256 amt) internal returns (uint256 got, uint256 quoted) {
        StoaRouter.Quote memory q = router.quote(address(0), tokenOut, amt);
        quoted = q.amountOut;
        uint256 b0 = IERC20(tokenOut).balanceOf(alice);
        vm.prank(alice);
        router.swap{value: amt}(
            StoaRouter.SwapParams({
                tokenIn: address(0),
                tokenOut: tokenOut,
                mid: q.mid,
                leg1: q.leg1,
                leg2: q.leg2,
                amountIn: amt,
                minOut: q.amountOut,
                to: alice,
                deadline: block.timestamp,
                referrer: address(0)
            })
        );
        got = IERC20(tokenOut).balanceOf(alice) - b0;
    }

    function test_fork_v3Rollout_endToEnd() public {
        if (!on) return vm.skip(true);
        PoolKey[] memory ks = pinnedKeys();
        // 1) right after the deploy: the keeper registers the pools Stoa's own flows use
        vm.startPrank(KEEPER);
        for (uint256 i; i < ks.length; ++i) {
            v3.register(ks[i]);
        }
        vm.stopPrank();
        // 2) the timelock pins them, one operation each; the keeper can no longer remove them
        for (uint256 i; i < ks.length; ++i) {
            vm.prank(LIVE_TIMELOCK);
            v3.setPinned(ks[i], true);
            vm.prank(KEEPER);
            vm.expectRevert(UniswapV4AdapterV3.PinnedKey.selector);
            v3.unregister(ks[i]);
        }
        // 3) the router takes V3 in and its V4 adapters out (V2 after the V4 fix; the first adapter if still listed)
        vm.prank(LIVE_TIMELOCK);
        router.propose(false, address(v3));
        vm.warp(block.timestamp + router.delay() + 1);
        vm.startPrank(LIVE_TIMELOCK);
        router.execute(false, address(v3));
        if (router.isAdapter(V4_V2)) router.removeAdapter(V4_V2);
        if (router.isAdapter(V4_OLD)) router.removeAdapter(V4_OLD);
        vm.stopPrank();
        assertTrue(router.isAdapter(address(v3)));

        // 4) a trader buys $STOA and USDG through the router: V3 is the only V4 venue now
        (uint256 stoa, uint256 qs) = _swapEth(STOA_TOKEN, 0.05 ether);
        (uint256 usdg, uint256 qu) = _swapEth(USDG_TOKEN, 0.05 ether);
        console2.log("0.05 ETH -> STOA through the router", stoa);
        console2.log("0.05 ETH -> USDG through the router", usdg);
        assertGe(stoa, qs);
        assertGe(usdg, qu);
        assertGt(v3.quote(WETH, STOA_TOKEN, 0.05 ether), 0, "V3 quotes the STOA pool");
        assertEq(IERC20(WETH).balanceOf(address(v3)), 0, "nothing left in the adapter");
        assertEq(address(v3).balance, 0);

        // 5) the guardian's off switch stops a hook at once, pinned key included
        vm.prank(V3_GUARDIAN);
        v3.disableHook(PONS_V2_HOOK);
        assertEq(v3.quote(WETH, STOA_TOKEN, 0.05 ether), 0, "Pons-hook pools stop routing in the same block");
        assertTrue(v3.pinned(keccak256(abi.encode(ks[0]))), "the pin stays");
    }
}
