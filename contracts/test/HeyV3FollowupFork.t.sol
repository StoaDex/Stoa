// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV2} from "../src/adapters/UniswapV4AdapterV2.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {SafetySim} from "../src/tools/SafetySim.sol";
import {MockToken, MockWHYPE} from "./mocks/Mocks.sol";
import {HeyLp, IPM} from "./HeyV3Gas.t.sol";

interface IAdapterKeys {
    function keysFor(address, address) external view returns (PoolKey[] memory);
}

interface IExtsloadF {
    function extsload(bytes32 slot) external view returns (bytes32);
}

contract NoFees {
    function notifyFee(address, uint256, address) external {}
}

/// @notice HEY Research Lab follow-up on Stoa's fixes 1111e9a and 109b08b, on a local fork of Robinhood Chain:
///         is SIM_GAS enough for the real pools, and what does an outsider's dust liquidity do to that.
///         V3 is deployed inside the test only. Run: ROBINHOOD_RPC_URL=http://127.0.0.1:8545 FORK_BLOCK=...
contract HeyV3FollowupForkTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant STOA = 0x13E6993417616De724F2b337D65063f229e96718;
    address constant ROUTER = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5;
    address constant TIMELOCK = 0xAC75133729d6B5d615aA696d0828dC31fcB83ed8;
    address constant KEEPER = 0xbf666e8D054935170b9f09127247905A975b3B80;
    address constant GUARDIAN = 0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9;
    address constant V2 = 0x27958279F95225b2a5517E7DD12b6Fc0317E5c5d;
    address constant PONS_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant ETHUSDG_HOOK = 0x987E330F00B79864a07FE81dFaC344D0078ABCC0;

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        uint256 at = vm.envOr("FORK_BLOCK", uint256(0));
        if (at == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, at);
        forked = true;
        console2.log("fork block", block.number);
    }

    function _hooks() internal pure returns (address[] memory h) {
        h = new address[](9);
        h[1] = PONS_HOOK;
        h[2] = ETHUSDG_HOOK;
        h[3] = 0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544;
        h[4] = 0x0Af57F62982D03066ef917AcAd87F771c06528Ec;
        h[5] = 0xee588bCF2bd3e658f5160489f4199d1851BBf0Cc;
        h[6] = 0x08E52564Bad99E05a694b4809F397edcA417A080;
        h[7] = 0x594e8e6281eDf2d363a0293a50004Cf868E7a080;
        h[8] = 0x5Eb87F69bE00Df39981622Fd60A8De4b7837e080;
    }

    function _v3() internal returns (UniswapV4AdapterV3) {
        return new UniswapV4AdapterV3(IPoolManager(PM), WETH, ROUTER, TIMELOCK, _hooks(), KEEPER, GUARDIAN);
    }

    function _single(PoolKey memory k) internal returns (UniswapV4AdapterV3 a) {
        a = _v3();
        vm.prank(KEEPER);
        a.register(k);
    }

    /// @dev The same pool behind V2's code, which has no gas cap: what the pool pays when gas is no object.
    function _uncapped(PoolKey memory k) internal returns (UniswapV4AdapterV2 a) {
        a = new UniswapV4AdapterV2(IPoolManager(PM), WETH, ROUTER, TIMELOCK, _hooks(), KEEPER);
        vm.prank(KEEPER);
        a.register(k);
    }

    function _tick(PoolKey memory k) internal view returns (int24) {
        bytes32 slot = keccak256(abi.encodePacked(keccak256(abi.encode(k)), bytes32(uint256(6))));
        return int24(uint24(uint256(IExtsloadF(PM).extsload(slot)) >> 160));
    }

    function _capped(UniswapV4AdapterV3 a, address tIn, address tOut, uint256 amt)
        internal
        returns (uint256 out, uint256 used)
    {
        vm.cool(PM);
        uint256 g = gasleft();
        out = a.quote(tIn, tOut, amt);
        used = g - gasleft();
    }

    /// The canonical $STOA pool (Pons hook, spacing 200) behind V3.
    function test_fork_followup_stoaPool_simGas() public {
        if (!forked) return;
        UniswapV4AdapterV3 a = _single(PoolKey(address(0), STOA, 0, 200, PONS_HOOK));
        uint256[3] memory eth = [uint256(0.5 ether), 5 ether, 50 ether];
        for (uint256 j; j < 3; ++j) {
            (uint256 out, uint256 used) = _capped(a, WETH, STOA, eth[j]);
            console2.log("ETH in / STOA out / quote gas:", eth[j], out, used);
            assertGt(out, 0);
            assertLt(used, 1_000_000);
        }
    }

    /// An outsider adds DUST_N (default 45) dust positions above the price of the live hook-less ETH/USDG pool with tick spacing 1
    /// (fee 0.01%). Locally, on the fork. Then the same USDG -> ETH quotes again. Sizes come from the environment
    /// (whole USDG) so the run stays short: the fork's node keeps a block's state for about ten minutes.
    function test_fork_followup_dustOnALiveSpacing1Pool() public {
        if (!forked) return;
        PoolKey memory k = PoolKey(address(0), USDG, 100, 1, address(0));
        UniswapV4AdapterV3 a = _single(k);
        uint256 small = vm.envOr("DUST_SMALL", uint256(100)) * 1e6;
        uint256 large = vm.envOr("DUST_LARGE", uint256(10_000)) * 1e6;
        _show("before the dust", a, small, large);
        (uint256 l0,) = _capped(a, USDG, WETH, large);
        assertGt(l0, 0, "pick a size the pool fills");

        HeyLp dust = new HeyLp(IPM(PM));
        vm.deal(address(dust), 1 ether);
        int24 t = _tick(k);
        uint256 g = gasleft();
        int24 n = int24(int256(vm.envOr("DUST_N", uint256(45))));
        for (int24 i; i < n; ++i) {
            dust.modify(k, t + 1 + i, t + 2 + i, 1e9);
        }
        g -= gasleft();
        console2.log("dust positions above the price:", uint256(int256(n)));
        console2.log("  gas / wei of ETH put in:", g, 1 ether - address(dust).balance);

        _show("after the dust", a, small, large);
        UniswapV4AdapterV2 u = _uncapped(k);
        vm.cool(PM);
        console2.log(
            "after the dust, large, same pool behind V2's code (no cap): ETH out:",
            u.quote{gas: 12_000_000}(USDG, WETH, large)
        );
    }

    /// Can an outsider add a position to the deepest ETH/USDG pool (dynamic fee, spacing 1, hook 0x987E...)? Its hook
    /// has the beforeAddLiquidity flag, so the answer is the hook's.
    function test_fork_followup_canAnOutsiderAddToTheHookedEthUsdgPool() public {
        if (!forked) return;
        PoolKey memory hk = PoolKey(address(0), USDG, 0x800000, 1, ETHUSDG_HOOK);
        HeyLp dust = new HeyLp(IPM(PM));
        vm.deal(address(dust), 1 ether);
        int24 ht = _tick(hk);
        try dust.modify(hk, ht + 1, ht + 2, 1e9) {
            console2.log(
                "hooked ETH/USDG pool: an outsider's one-tick position is accepted. wei of ETH put in:",
                1 ether - address(dust).balance
            );
        } catch (bytes memory e) {
            console2.log("hooked ETH/USDG pool: an outsider's position is refused, revert data:");
            console2.logBytes(e);
        }
    }

    function _show(string memory when, UniswapV4AdapterV3 a, uint256 small, uint256 large) internal {
        (uint256 o, uint256 g) = _capped(a, USDG, WETH, small);
        console2.log(when, "| small: USDG in / ETH out / quote gas:");
        console2.log("   ", small, o, g);
        (o, g) = _capped(a, USDG, WETH, large);
        console2.log(when, "| large: USDG in / ETH out / quote gas:");
        console2.log("   ", large, o, g);
    }
}

/// @notice The app's token safety test (SafetySim, eth_call with gas 15,000,000 in web/lib/safety.ts) against a V3
///         pair that holds slow keys. Local: Robinhood Chain's PoolManager code, a StoaRouter built in the test.
contract HeyV3FollowupSafetyTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint160 constant MID = uint160(1) << 96;

    UniswapV4AdapterV3 v3;
    StoaRouter router;
    MockWHYPE weth;
    MockToken tok;
    HeyLp lp;
    SafetySim sim;
    address gov = makeAddr("gov");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.etch(PM, vm.parseBytes(vm.trim(vm.readFile("test/data/poolmanager-4663-runtime.hex"))));
        weth = new MockWHYPE();
        tok = new MockToken("TOK", 18);
        lp = new HeyLp(IPM(PM));
        vm.deal(address(lp), 1e24);
        tok.mint(address(lp), 1e24);
        router = new StoaRouter(
            gov, IFeeDistributor(address(new NoFees())), address(weth), ISignatureTransfer(address(0)), 1 days
        );
        address[] memory hooks = new address[](1);
        v3 = new UniswapV4AdapterV3(IPoolManager(PM), address(weth), address(router), gov, hooks, keeper, gov);
        vm.prank(gov);
        router.addAdapter(address(v3));
        PoolKey memory real = PoolKey(address(0), address(tok), 3000, 60, address(0));
        IPM(PM).initialize(real, MID);
        lp.modify(real, -887220, 887220, 1000e18);
        vm.prank(keeper);
        v3.register(real);
        sim = new SafetySim();
        vm.deal(address(sim), 10 ether);
    }

    function _check() internal returns (bool buyOk, bool sellOk, uint256 used, bytes memory sellError) {
        uint256 snap = vm.snapshotState();
        vm.cool(PM);
        uint256 g = gasleft();
        SafetySim.Result memory r = sim.check{gas: 15_000_000}(router, address(tok), 0.001 ether);
        used = g - gasleft();
        (buyOk, sellOk, sellError) = (r.buyOk, r.sellOk, r.sellError);
        vm.revertToState(snap);
    }

    /// Slow keys = hook-less pools with tick spacing 10 (the narrowest the keeper now lists) that were emptied
    /// after listing. Each costs about 1.9M per cold simulation. How many does the 15M safety test survive?
    function test_followup_safetySim_15M_bySlowKeys() public {
        (bool b, bool s, uint256 used,) = _check();
        console2.log("slow keys 0: buy ok / sell ok / gas:", b, s, used);
        assertTrue(b && s);
        for (uint24 i = 1; i <= 5; ++i) {
            PoolKey memory j = PoolKey(address(0), address(tok), 100 + i, 10, address(0));
            IPM(PM).initialize(j, MID);
            lp.modify(j, -1000, 1000, 2e18); // deep enough for the keeper's small depth test
            vm.prank(keeper);
            v3.register(j);
            lp.modify(j, -1000, 1000, -2e18); // and withdrawn after listing
            bytes memory err;
            (b, s, used, err) = _check();
            console2.log("slow keys / gas of the safety test:", i, used);
            console2.log("   buy ok / sell ok:", b, s);
            if (!s) console2.logBytes(err);
        }
    }
}
