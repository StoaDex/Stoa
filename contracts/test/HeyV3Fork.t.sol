// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey, IPoolManager, IWETH} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";

interface IAdapterLike {
    function quote(address, address, uint256) external returns (uint256);
    function swap(address, address, uint256, uint256, address) external returns (uint256);
    function keysFor(address, address) external view returns (PoolKey[] memory);
}

interface IPoolManagerInit {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

interface IFablesHook {
    function currentFee(bytes32 poolId, bool zeroForOne) external view returns (uint24);
    function maxFee(bytes32 poolId) external view returns (uint24);
    function ABSOLUTE_MAX_FEE() external view returns (uint24);
}

/// @dev Added to Stoa's repo from HEY Research Lab's review (17 Nov 2026). Stoa's changes: the constructor's new guardian
///      argument (the router's guardian).
/// @notice HEY Research Lab pre-deploy review of UniswapV4AdapterV3 (commit b0fd23b) on a local fork of Robinhood
///         Chain. V3 is deployed inside the test only; nothing is sent to a live network.
///         Run: ROBINHOOD_RPC_URL=... forge test --match-path test/HeyV3Fork.t.sol -vv
contract HeyV3ForkTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant STOA = 0x13E6993417616De724F2b337D65063f229e96718;
    address constant PONS = 0x39dBED3a2bd333467115dE45665cC57F813C4571;
    address constant ROUTER = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5;
    address constant TIMELOCK = 0xAC75133729d6B5d615aA696d0828dC31fcB83ed8;
    address constant KEEPER = 0xbf666e8D054935170b9f09127247905A975b3B80;
    address constant GUARDIAN = 0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9;
    address constant V2 = 0x27958279F95225b2a5517E7DD12b6Fc0317E5c5d;
    address constant PONS_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant FABLES_RAMP = 0x08E52564Bad99E05a694b4809F397edcA417A080;
    address constant FABLES_RAMP_ETH = 0x594e8e6281eDf2d363a0293a50004Cf868E7a080;
    address constant FABLES_RWA = 0x5Eb87F69bE00Df39981622Fd60A8De4b7837e080;
    address constant RWA_TOKEN = 0xCceE82fE024c36fA15E1005edE3E9e4787e23D09;
    uint24 constant DYNAMIC = 0x800000;

    UniswapV4AdapterV3 v3;
    address user = makeAddr("user");
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        uint256 at = vm.envOr("FORK_BLOCK", uint256(0));
        if (at == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, at);
        forked = true;
        // exactly the list DeployV4AdapterV3Robinhood.s.sol builds: v4Hooks() plus the three Fables hooks
        address[] memory h = new address[](9);
        h[0] = address(0);
        h[1] = PONS_HOOK;
        h[2] = 0x987E330F00B79864a07FE81dFaC344D0078ABCC0;
        h[3] = 0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544;
        h[4] = 0x0Af57F62982D03066ef917AcAd87F771c06528Ec;
        h[5] = 0xee588bCF2bd3e658f5160489f4199d1851BBf0Cc;
        h[6] = FABLES_RAMP;
        h[7] = FABLES_RAMP_ETH;
        h[8] = FABLES_RWA;
        v3 = new UniswapV4AdapterV3(IPoolManager(PM), WETH, ROUTER, TIMELOCK, h, KEEPER, GUARDIAN);
        console2.log("fork block", block.number);
    }

    function _stoaKey() internal pure returns (PoolKey memory) {
        return PoolKey(address(0), STOA, 0, 200, PONS_HOOK);
    }

    function _fund(address adapter, address token, uint256 amount) internal {
        if (token == WETH) {
            vm.deal(address(this), amount);
            IWETH(WETH).deposit{value: amount}();
        }
        IERC20(token).transfer(adapter, amount);
    }

    function _swapAsRouter(address adapter, address tIn, address tOut, uint256 amount) internal returns (uint256) {
        _fund(adapter, tIn, amount);
        vm.prank(ROUTER);
        return IAdapterLike(adapter).swap(tIn, tOut, amount, 0, address(this));
    }

    // ---------------------------------------------------------------- swap path equals V2's, on the real STOA pool

    function test_fork_swapPathMatchesV2_onTheCanonicalStoaPool() public {
        if (!forked) return;
        PoolKey[] memory live = IAdapterLike(V2).keysFor(WETH, STOA);
        assertEq(live.length, 1, "V2 holds one STOA pool");
        assertEq(live[0].hooks, PONS_HOOK);
        vm.prank(KEEPER);
        v3.register(_stoaKey());
        vm.prank(TIMELOCK);
        v3.setPinned(_stoaKey(), true);

        uint256 amt = 0.5 ether;
        uint256 q2 = IAdapterLike(V2).quote(WETH, STOA, amt);
        uint256 q3 = v3.quote(WETH, STOA, amt);
        assertEq(q3, q2, "same quote");
        assertGt(q3, 0);

        uint256 snap = vm.snapshotState();
        uint256 buy2 = _swapAsRouter(V2, WETH, STOA, amt);
        uint256 sell2 = _swapAsRouter(V2, STOA, WETH, buy2 / 2);
        assertEq(IERC20(STOA).balanceOf(V2), 0);
        assertEq(IERC20(WETH).balanceOf(V2), 0);
        assertEq(V2.balance, 0);
        vm.revertToState(snap);
        uint256 buy3 = _swapAsRouter(address(v3), WETH, STOA, amt);
        uint256 sell3 = _swapAsRouter(address(v3), STOA, WETH, buy3 / 2);
        assertEq(buy3, buy2, "same buy");
        assertEq(sell3, sell2, "same sell");
        assertEq(buy3, q3, "swap pays the quote");
        assertEq(IERC20(STOA).balanceOf(address(v3)), 0, "nothing left in the adapter");
        assertEq(IERC20(WETH).balanceOf(address(v3)), 0);
        assertEq(address(v3).balance, 0);
        console2.log("0.5 ETH -> STOA, V2 / V3", buy2, buy3);
        console2.log("STOA -> ETH,     V2 / V3", sell2, sell3);
    }

    // ---------------------------------------------------------------- the three Fables hooks

    function test_fork_fablesHooks_routeBothWays_andStopWhenDisallowed() public {
        if (!forked) return;
        PoolKey memory ethPons = PoolKey(address(0), PONS, DYNAMIC, 60, FABLES_RAMP_ETH);
        PoolKey memory ponsUsdg = PoolKey(PONS, USDG, DYNAMIC, 60, FABLES_RAMP);
        PoolKey memory usdgRwa = PoolKey(USDG, RWA_TOKEN, DYNAMIC, 60, FABLES_RWA);
        vm.startPrank(KEEPER);
        v3.register(ethPons);
        v3.register(ponsUsdg);
        v3.register(usdgRwa);
        vm.stopPrank();

        console2.log(
            "ABSOLUTE_MAX_FEE pips ramp / rampETH / rwa",
            IFablesHook(FABLES_RAMP).ABSOLUTE_MAX_FEE(),
            IFablesHook(FABLES_RAMP_ETH).ABSOLUTE_MAX_FEE(),
            IFablesHook(FABLES_RWA).ABSOLUTE_MAX_FEE()
        );
        _logFee("ETH/PONS  (FablesRampETH)", FABLES_RAMP_ETH, ethPons);
        _logFee("PONS/USDG (FablesRamp)", FABLES_RAMP, ponsUsdg);
        _logFee("USDG/RWA  (FablesRWA)", FABLES_RWA, usdgRwa);

        // ETH -> PONS on the FablesRampETH pool
        uint256 q = v3.quote(WETH, PONS, 0.01 ether);
        assertGt(q, 0, "RampETH pool quotes");
        uint256 pons = _swapAsRouter(address(v3), WETH, PONS, 0.01 ether);
        assertEq(pons, q, "swap pays the quote");
        // PONS -> USDG on the FablesRamp pool
        q = v3.quote(PONS, USDG, pons / 2);
        assertGt(q, 0, "Ramp pool quotes");
        uint256 usdg = _swapAsRouter(address(v3), PONS, USDG, pons / 2);
        assertEq(usdg, q);
        // USDG -> RWA token and back on the FablesRWA pool
        q = v3.quote(USDG, RWA_TOKEN, usdg / 2);
        assertGt(q, 0, "RWA pool quotes");
        uint256 rwa = _swapAsRouter(address(v3), USDG, RWA_TOKEN, usdg / 2);
        assertEq(rwa, q);
        uint256 back = _swapAsRouter(address(v3), RWA_TOKEN, USDG, rwa);
        assertGt(back, 0);
        // PONS -> ETH back through RampETH (native out is wrapped for the router)
        uint256 weth = _swapAsRouter(address(v3), PONS, WETH, pons / 4);
        assertGt(weth, 0);
        assertEq(IERC20(WETH).balanceOf(address(v3)), 0);
        assertEq(address(v3).balance, 0);
        console2.log("0.01 ETH -> PONS", pons);
        console2.log("PONS/2 -> USDG", usdg);
        console2.log("USDG/2 -> RWA, and back", rwa, back);

        // the timelock takes the hooks off the list: quote and swap stop in the same block
        vm.startPrank(TIMELOCK);
        v3.setHookAllowed(FABLES_RAMP, false);
        v3.setHookAllowed(FABLES_RAMP_ETH, false);
        v3.setHookAllowed(FABLES_RWA, false);
        vm.stopPrank();
        assertEq(v3.quote(WETH, PONS, 0.01 ether), 0);
        assertEq(v3.quote(PONS, USDG, pons / 4), 0);
        assertEq(v3.quote(USDG, RWA_TOKEN, 1e6), 0);
        _fund(address(v3), PONS, pons / 8);
        vm.prank(ROUTER);
        vm.expectRevert(UniswapV4AdapterV3.NoPath.selector);
        v3.swap(PONS, USDG, pons / 8, 0, address(this));
        vm.prank(KEEPER);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v3.register(PoolKey(USDG, 0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD, DYNAMIC, 60, FABLES_RWA));
    }

    function _logFee(string memory name, address hook, PoolKey memory key) internal view {
        bytes32 id = keccak256(abi.encode(key));
        console2.log(name);
        console2.log(
            "  fee now 0->1 / 1->0 / pool cap (pips)",
            IFablesHook(hook).currentFee(id, true),
            IFablesHook(hook).currentFee(id, false),
            IFablesHook(hook).maxFee(id)
        );
    }

    /// Nobody outside Fables can open a pool on a Fables hook, so allowlisting them does not let outsiders mint
    /// routable hooked pools (unlike the hook-less entry).
    function test_fork_outsiderCannotCreateAFablesPool() public {
        if (!forked) return;
        address[3] memory hooks = [FABLES_RAMP, FABLES_RAMP_ETH, FABLES_RWA];
        for (uint256 i; i < 3; ++i) {
            vm.prank(user);
            vm.expectRevert();
            IPoolManagerInit(PM).initialize(PoolKey(address(0), STOA, DYNAMIC, 60, hooks[i]), uint160(1) << 96);
            vm.prank(user);
            vm.expectRevert();
            IPoolManagerInit(PM)
                .initialize(
                    PoolKey(WETH, address(0xF000000000000000000000000000000000000001), DYNAMIC, 60, hooks[i]),
                    uint160(1) << 96
                );
        }
    }
}
