// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/Test.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {UniswapV2Adapter, IUniswapV2Factory} from "../src/adapters/UniswapV2Adapter.sol";
import {UniswapV3Adapter, IUniswapV3Factory} from "../src/adapters/UniswapV3Adapter.sol";
import {UniswapV4Adapter, IPoolManager, PoolKey} from "../src/adapters/UniswapV4Adapter.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VenuesRobinhood} from "../script/VenuesRobinhood.sol";

/// @notice The router and the Uniswap V2, V3 and V4 adapters against live Robinhood Chain pools.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhood -vv
contract ForkRobinhoodTest is RouterHelper, VenuesRobinhood {
    StoaRouter router;
    FeeDistributor fees;
    UniswapV2Adapter v2;
    UniswapV3Adapter v3;
    UniswapV4Adapter v4;
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code); // Arbitrum Orbit precompile, absent in local forks
        MakerRegistry reg = new MakerRegistry(address(this), address(this), 1 days);
        fees = new FeeDistributor(address(this), IMakerRegistry(address(reg)));
        router =
            new StoaRouter(address(this), IFeeDistributor(address(fees)), WETH, ISignatureTransfer(PERMIT2), 1 days);
        v2 = new UniswapV2Adapter(IUniswapV2Factory(UNI_V2_FACTORY), WETH, address(router));
        v3 = new UniswapV3Adapter(IUniswapV3Factory(UNI_V3_FACTORY), WETH, address(router));
        v4 = new UniswapV4Adapter(IPoolManager(V4_POOL_MANAGER), WETH, address(router), address(this), v4Hooks());
        router.addAdapter(address(v2));
        router.addAdapter(address(v3));
        router.addAdapter(address(v4));
        fees.setNotifier(address(router), true);
        vm.deal(alice, 100 ether);
    }

    function _key(address token, uint24 fee, int24 ts, address hooks) internal pure returns (PoolKey memory) {
        return PoolKey({currency0: address(0), currency1: token, fee: fee, tickSpacing: ts, hooks: hooks});
    }

    /// one live native-ETH pool per allowed hook (the most traded one when the list was made)
    function _keys() internal pure returns (PoolKey[] memory k) {
        address[] memory h = v4Hooks();
        k = new PoolKey[](6);
        k[0] = _key(USDG, 500, 10, h[0]); // ETH/USDG 0.05%, no hook
        k[1] = _key(0x6437614eA1efBa0eB4b43bC1aF53808722B1Cf13, 0, 200, h[1]);
        k[2] = _key(USDG, 0x800000, 1, h[2]);
        k[3] = _key(0x7900ccF94a00028EC969D8349D064FcEd2511E18, 0x800000, 8, h[3]);
        k[4] = _key(0x2Fc6dE9C65a620f918cA7d1191D3AFA495ca2898, 0, 60, h[4]);
        k[5] = _key(0xaCC8De336F5D2366FA7334383D8FaB73499F582A, 0x800000, 60, h[5]);
    }

    function test_fork_ethUsdgQuotesAndRoundTrip() public {
        if (!on) return vm.skip(true);
        v4.register(_keys()[0]);
        v4.register(_keys()[2]);
        uint256 q2 = v2.quote(WETH, USDG, 0.01 ether);
        uint256 q3 = v3.quote(WETH, USDG, 0.01 ether);
        uint256 q4 = v4.quote(WETH, USDG, 0.01 ether);
        console2.log("0.01 WETH -> USDG  v2:", q2, " v3:", q3);
        console2.log("                   v4:", q4);
        StoaRouter.Quote memory q = router.quote(address(0), USDG, 0.01 ether);
        assertGt(q.amountOut, 0, "no route ETH -> USDG");
        uint256 out = _swapAs(router, alice, address(0), USDG, 0.01 ether, q.amountOut, alice, address(0));
        assertEq(out, q.amountOut, "fill equals quote in the same block");
        assertGt(IERC20(USDG).balanceOf(address(fees)), 0, "fee collected");
        vm.prank(alice);
        IERC20(USDG).approve(address(router), out);
        uint256 before = alice.balance;
        uint256 back = _swapAs(router, alice, USDG, address(0), out, 0, alice, address(0));
        console2.log("round trip 0.01 ETH ->", back, "wei");
        assertEq(alice.balance - before, back);
        assertGt(back, 0.0095 ether, "round trip loses < 5%");
        _assertAdaptersEmpty();
    }

    function test_fork_eachAllowedHookBuysAndSells() public {
        if (!on) return vm.skip(true);
        PoolKey[] memory k = _keys();
        for (uint256 i; i < k.length; ++i) {
            v4.register(k[i]);
            address t = k[i].currency1;
            StoaRouter.SwapParams memory p = _params(router, address(0), t, 0.001 ether, 1, alice, address(0));
            p.mid = address(0);
            p.leg1 = StoaRouter.Leg(address(v4), false);
            uint256 b0 = IERC20(t).balanceOf(alice);
            vm.prank(alice);
            uint256 got = router.swap{value: 0.001 ether}(p);
            assertEq(IERC20(t).balanceOf(alice) - b0, got, "buy delivered");
            assertGt(got, 0, "buy");

            uint256 sellAmt = got / 2;
            vm.prank(alice);
            IERC20(t).approve(address(router), sellAmt);
            StoaRouter.SwapParams memory s = _params(router, t, address(0), sellAmt, 1, alice, address(0));
            s.mid = address(0);
            s.leg1 = StoaRouter.Leg(address(v4), false);
            uint256 e0 = alice.balance;
            vm.prank(alice);
            uint256 eth = router.swap(s);
            assertEq(alice.balance - e0, eth, "sell delivered");
            console2.log("hook", i, "buy/sell ok, wei back:", eth);
        }
        _assertAdaptersEmpty();
    }

    function test_fork_v4RejectsUnknownHook() public {
        if (!on) return vm.skip(true);
        PoolKey memory bad = _keys()[0];
        bad.hooks = address(0xBEEF);
        vm.expectRevert(UniswapV4Adapter.HookNotAllowed.selector);
        v4.register(bad);
    }

    function _assertAdaptersEmpty() internal view {
        address[3] memory ads = [address(v2), address(v3), address(v4)];
        for (uint256 i; i < 3; ++i) {
            assertEq(ads[i].balance, 0, "adapter keeps no ETH");
            assertEq(IERC20(WETH).balanceOf(ads[i]), 0, "adapter keeps no WETH");
            assertEq(IERC20(USDG).balanceOf(ads[i]), 0, "adapter keeps no USDG");
        }
        assertEq(address(router).balance, 0, "router keeps no ETH");
    }
}

/// @dev Stand-in for Arbitrum's ArbSys precompile (0x64) in local forks.
contract ArbSysMock {
    function arbBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function arbChainID() external view returns (uint256) {
        return block.chainid;
    }
}
