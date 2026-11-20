// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";
import {MockToken, MockWHYPE} from "./mocks/Mocks.sol";
import {HeyLp, IPM} from "./HeyV3Gas.t.sol";
import {MockQuotingPoolManager} from "./UniswapV4AdapterV3.t.sol";

interface IExtsload {
    function extsload(bytes32 slot) external view returns (bytes32);
}

interface IQuoteLike {
    function quote(address, address, uint256) external returns (uint256);
}

/// @dev A PoolManager that answers every simulation with the gas it was given: out = max - gasleft(), so the
///      adapter's "largest out wins" returns the SMALLEST gas any simulation of the call received.
contract GasProbePoolManager {
    error Simulated(uint256 inUsed, uint256 out);

    function extsload(bytes32) external pure returns (bytes32) {
        return bytes32(uint256(1) << 100);
    }

    function unlock(bytes calldata data) external view returns (bytes memory) {
        uint256 g = gasleft();
        (,,, uint256 amountIn) = abi.decode(data, (bool, PoolKey, bool, uint256));
        revert Simulated(amountIn, type(uint256).max - g);
    }
}

/// @dev The same try/catch StoaRouter._bestLeg puts around an adapter's quote (StoaRouter.sol:473-475).
contract TryQuoter {
    function best(address adapter, address a, address b, uint256 amt) external returns (uint256 out) {
        try IQuoteLike(adapter).quote(a, b, amt) returns (uint256 o) {
            out = o;
        } catch {}
    }
}

/// @notice HEY Research Lab follow-up on Stoa's fixes 1111e9a and 109b08b (UniswapV4AdapterV3, not deployed).
///         Mock PoolManagers only: what the LowGas check and the guardian switch do at their edges.
contract HeyV3FollowupUnitTest is Test {
    UniswapV4AdapterV3 v;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address guardian = makeAddr("guardian");
    address router = makeAddr("router");
    address tok = makeAddr("tok");
    address weth = makeAddr("weth");
    address hook = makeAddr("hook");

    event HookSet(address indexed hooks, bool allowed);

    function _deploy(address pm) internal {
        address[] memory hooks = new address[](2);
        hooks[1] = hook; // address(0) (hook-less) and one hook
        v = new UniswapV4AdapterV3(IPoolManager(pm), weth, router, owner, hooks, keeper, guardian);
    }

    function _key(uint24 fee, address h) internal view returns (PoolKey memory) {
        return PoolKey(address(0), tok, fee, 60, h);
    }

    /// At every gas limit a caller can send, a quote over a full pair either reverts or gives each of the six
    /// simulations the whole SIM_GAS. There is no gas limit at which a simulation runs with less.
    function test_followup_everySimulationGetsFullSimGas_atAnyCallerGas() public {
        _deploy(address(new GasProbePoolManager()));
        for (uint24 i; i < 6; ++i) {
            vm.prank(keeper);
            v.register(_key(100 + i, address(0)));
        }
        uint256 sim = v.SIM_GAS();
        uint256 firstOk;
        uint256 nOk;
        uint256 nLow;
        uint256 nOut;
        uint256 lowest = type(uint256).max;
        for (uint256 g = 30_000; g <= 14_000_000; g += 9_973) {
            (bool ok, bytes memory ret) = address(v).call{gas: g}(abi.encodeCall(v.quote, (weth, tok, 1e18)));
            if (ok) {
                uint256 minGas = type(uint256).max - abi.decode(ret, (uint256));
                assertGe(minGas, sim - 1_000, "a simulation got less than SIM_GAS");
                assertLe(minGas, sim);
                if (minGas < lowest) lowest = minGas;
                if (firstOk == 0) firstOk = g;
                ++nOk;
            } else {
                assertEq(firstOk, 0, "a failure above the first success");
                if (ret.length == 4 && bytes4(ret) == UniswapV4AdapterV3.LowGas.selector) {
                    ++nLow;
                } else {
                    assertEq(ret.length, 0, "only LowGas or out of gas");
                    ++nOut;
                }
            }
        }
        console2.log("gas limits tried / reverted LowGas / ran out of gas / answered:", nOk + nLow + nOut, nLow, nOut);
        console2.log("  answered:", nOk);
        console2.log("  lowest gas limit that answered:", firstOk);
        console2.log("  smallest gas any simulation received in an answered call:", lowest);
        assertGt(nLow, 0);
        assertGt(nOk, 0);
    }

    /// The adapter reverts LowGas, but StoaRouter.quote wraps each adapter in try/catch, so an eth_call that is short
    /// of gas sees "no V4 route" (0) for the pair. It never sees the worse pool's quote: 0 or the best, nothing else.
    function test_followup_routerStyleTryCatch_turnsLowGasIntoNoQuote_neverAWorsePool() public {
        _deploy(address(new MockQuotingPoolManager()));
        vm.startPrank(keeper);
        v.register(_key(300, address(0))); // pays 3x
        v.register(_key(500, address(0))); // pays 5x, listed second
        vm.stopPrank();
        TryQuoter tq = new TryQuoter();
        uint256 zero;
        uint256 best;
        for (uint256 g = 60_000; g <= 6_000_000; g += 7_919) {
            (bool ok, bytes memory ret) =
                address(tq).call{gas: g}(abi.encodeCall(tq.best, (address(v), weth, tok, 100)));
            if (!ok) continue; // the wrapper itself ran out
            uint256 out = abi.decode(ret, (uint256));
            assertTrue(out == 0 || out == 500, "never the worse pool's quote");
            if (out == 0) ++zero;
            else ++best;
        }
        console2.log("try/catch caller: answers of 0 (V4 dropped) / best quote:", zero, best);
        assertGt(zero, 0, "a starved eth_call drops the V4 venue silently");
        assertGt(best, 0);
    }

    /// The guardian can switch off hook-less pools too (address(0) is an allowlist entry like any hook). Everything
    /// stays registered and pinned; only the owner can switch it back on.
    function test_followup_guardianCanSwitchOffHooklessPools_ownerSwitchesBackOn_pinsKept() public {
        _deploy(address(new MockQuotingPoolManager()));
        vm.startPrank(keeper);
        v.register(_key(300, address(0)));
        v.register(_key(700, hook));
        vm.stopPrank();
        vm.startPrank(owner);
        v.setPinned(_key(300, address(0)), true);
        v.setPinned(_key(700, hook), true);
        vm.stopPrank();
        assertEq(v.quote(weth, tok, 100), 700);

        vm.startPrank(guardian);
        vm.expectEmit(true, false, false, true, address(v));
        emit HookSet(address(0), false);
        v.disableHook(address(0));
        vm.expectEmit(true, false, false, true, address(v));
        emit HookSet(hook, false);
        v.disableHook(hook);
        vm.expectEmit(true, false, false, true, address(v));
        emit HookSet(hook, false); // again: no state change, the event is emitted anyway
        v.disableHook(hook);
        vm.stopPrank();
        assertEq(v.quote(weth, tok, 100), 0, "nothing routes");
        vm.prank(router);
        vm.expectRevert(UniswapV4AdapterV3.NoPath.selector);
        v.swap(weth, tok, 100, 0, address(this));
        assertEq(v.keysFor(weth, tok).length, 2, "keys keep their slots");
        assertTrue(v.pinned(v.poolId(_key(300, address(0)))));
        assertTrue(v.pinned(v.poolId(_key(700, hook))));

        // while off: nothing new with that hook, the keeper still cannot remove a pinned key, the owner can still pin
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v.register(_key(800, hook));
        vm.prank(owner);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v.register(_key(800, hook));
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.PinnedKey.selector);
        v.unregister(_key(700, hook));
        vm.prank(owner);
        v.setPinned(_key(700, hook), false);
        vm.prank(owner);
        v.setPinned(_key(700, hook), true);

        // the guardian has no way back on
        vm.prank(guardian);
        vm.expectRevert();
        v.setHookAllowed(hook, true);
        vm.prank(guardian);
        vm.expectRevert();
        v.setGuardian(guardian);

        // the owner (timelock) switches both back on: same keys, same pins, same route
        vm.startPrank(owner);
        v.setHookAllowed(address(0), true);
        v.setHookAllowed(hook, true);
        vm.stopPrank();
        assertEq(v.quote(weth, tok, 100), 700);
        assertTrue(v.pinned(v.poolId(_key(700, hook))));
        // and the guardian can switch it off again in the same block
        vm.prank(guardian);
        v.disableHook(hook);
        assertEq(v.quote(weth, tok, 100), 300);
    }
}

/// @notice The same follow-up on Robinhood Chain's own PoolManager code, run locally at its address with empty
///         storage (test/data/poolmanager-4663-runtime.hex). No fork, no network.
contract HeyV3FollowupGasTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint160 constant MID = uint160(1) << 96;
    uint160 constant HIGHEST = 1461446703485210103287233400603844494775084016;

    UniswapV4AdapterV3 v3;
    MockWHYPE weth;
    HeyLp lp;
    HeyLp dustLp;
    address timelock = makeAddr("timelock");
    address keeper = makeAddr("keeper");
    address router = makeAddr("router");

    function setUp() public {
        vm.etch(PM, vm.parseBytes(vm.trim(vm.readFile("test/data/poolmanager-4663-runtime.hex"))));
        weth = new MockWHYPE();
        lp = new HeyLp(IPM(PM));
        dustLp = new HeyLp(IPM(PM)); // an outsider's liquidity contract
        vm.deal(address(lp), 1e24);
        vm.deal(address(dustLp), 1 ether);
        address[] memory hooks = new address[](1);
        v3 = new UniswapV4AdapterV3(IPoolManager(PM), address(weth), router, timelock, hooks, keeper, makeAddr("g"));
    }

    /// A pool ETH/T with 1,000 ETH + 1,000 T of full-range liquidity at price 1, listed and pinned.
    function _mk(int24 s, uint24 fee) internal returns (PoolKey memory k, MockToken t) {
        t = new MockToken("T", 18);
        k = PoolKey(address(0), address(t), fee, s, address(0));
        IPM(PM).initialize(k, MID);
        t.mint(address(lp), 1e24);
        t.mint(address(dustLp), 1 ether);
        int24 m = (int24(887272) / s) * s;
        lp.modify(k, -m, m, 1000e18);
        vm.prank(keeper);
        v3.register(k);
        vm.prank(timelock);
        v3.setPinned(k, true);
    }

    function _buy(MockToken t, uint256 amt, uint256 gasLimit) internal returns (bool ok, uint256 got) {
        vm.deal(address(this), amt);
        weth.deposit{value: amt}();
        weth.transfer(address(v3), amt);
        uint256 b0 = t.balanceOf(address(this));
        vm.cool(PM);
        vm.prank(router);
        (ok,) = address(v3).call{gas: gasLimit}(
            abi.encodeCall(v3.swap, (address(weth), address(t), amt, 0, address(this)))
        );
        got = t.balanceOf(address(this)) - b0;
    }

    function _sell(MockToken t, uint256 amt, uint256 gasLimit) internal returns (bool ok, uint256 got) {
        t.mint(address(v3), amt);
        uint256 b0 = weth.balanceOf(address(this));
        vm.cool(PM);
        vm.prank(router);
        (ok,) = address(v3).call{gas: gasLimit}(
            abi.encodeCall(v3.swap, (address(t), address(weth), amt, 0, address(this)))
        );
        got = weth.balanceOf(address(this)) - b0;
    }

    function _q(address a, address b, uint256 amt) internal returns (uint256 used, uint256 out) {
        vm.cool(PM);
        uint256 g = gasleft();
        out = v3.quote(a, b, amt);
        used = g - gasleft();
    }

    function _tick(PoolKey memory k) internal view returns (int24) {
        bytes32 slot = keccak256(abi.encodePacked(keccak256(abi.encode(k)), bytes32(uint256(6))));
        return int24(uint24(uint256(IExtsload(PM).extsload(slot)) >> 160));
    }

    /// n one-spacing positions of dust liquidity next to the price, above it (up) or below it. Anyone can add them.
    function _dust(PoolKey memory k, uint256 n, bool up) internal returns (uint256 gasSpent) {
        int24 s = k.tickSpacing;
        int24 t = _tick(k);
        int24 c = t / s;
        if (t < 0 && t % s != 0) --c;
        for (uint256 i; i < n; ++i) {
            int24 lo;
            int24 hi;
            if (up) {
                lo = (c + 1 + int24(int256(i))) * s;
                hi = lo + s;
            } else {
                hi = (c - int24(int256(i))) * s;
                lo = hi - s;
            }
            uint256 g = gasleft();
            dustLp.modify(k, lo, hi, 1e9);
            gasSpent += g - gasleft();
        }
    }

    /// 1,000 * (1.0001^(ticks/2) - 1), in wei: the input that moves this pool's price by `ticks` (before the fee).
    function _amountFor(uint256 ticks) internal pure returns (uint256) {
        uint256 r = 1e18;
        uint256 b = 1000049998750062496; // sqrt(1.0001)
        for (uint256 e = ticks; e > 0; e >>= 1) {
            if (e & 1 == 1) r = r * b / 1e18;
            b = b * b / 1e18;
        }
        return (r - 1e18) * 1000;
    }

    /// What one initialized tick adds to a simulation, and so how many fit under SIM_GAS. Dust positions make them.
    function test_followup_dustTicks_gasPerCrossedTick() public {
        int24[4] memory spacings = [int24(1), 10, 60, 200];
        for (uint256 i; i < spacings.length; ++i) {
            _perTick(spacings[i], 20);
        }
    }

    function _perTick(int24 s, uint256 n) internal {
        (PoolKey memory k, MockToken t) = _mk(s, 3000);
        _buy(t, 1 ether, 30_000_000); // fees have accrued in both currencies, as on any traded pool
        _sell(t, 1 ether, 30_000_000);
        uint256 amt = _amountFor((n + 4) * uint256(int256(s))) * 103 / 100;
        (uint256 up0,) = _q(address(t), address(weth), amt); // T in: price up
        (uint256 dn0,) = _q(address(weth), address(t), amt); // ETH in: price down
        uint256 mintGas = _dust(k, n, true) + _dust(k, n, false);
        (uint256 up1, uint256 outUp) = _q(address(t), address(weth), amt);
        (uint256 dn1, uint256 outDn) = _q(address(weth), address(t), amt);
        assertGt(outUp, 0);
        assertGt(outDn, 0);
        console2.log("spacing:", uint256(int256(s)));
        console2.log("  quote gas, no dust, up / down:", up0, dn0);
        console2.log("  quote gas, 21 dust ticks each side, up / down:", up1, dn1);
        console2.log(
            "  gas per crossed dust tick, up (first crossing) / down:", (up1 - up0) / (n + 1), (dn1 - dn0) / (n + 1)
        );
        console2.log(
            "  ticks that fit under SIM_GAS, up / down:",
            (v3.SIM_GAS() - up0) * (n + 1) / (up1 - up0),
            (v3.SIM_GAS() - dn0) * (n + 1) / (dn1 - dn0)
        );
        console2.log("  gas the outsider paid for the 40 positions:", mintGas);
    }

    /// The gas cap skips a pool whose simulation needs more than SIM_GAS, also when that pool could fill the trade.
    /// Dust positions on each side of the pinned real pool (anyone can add them) make every trade that crosses
    /// them cost more than SIM_GAS to simulate: the real pool drops out for those sizes. Alone on its pair the swap
    /// reverts NoPath; with a worse pool listed beside it, quote and swap go to the worse pool.
    uint256 fairSmallSell;
    uint256 fairSell;
    uint256 fairBuy;
    uint256 constant SMALL = 0.2 ether; // moves the price about 0.04%: under one spacing
    uint256 constant LARGE = 150 ether; // moves it about 32%: every dust tick on its side

    function test_followup_dustTicks_dropThePinnedRealPool_forTradesThatCrossThem() public {
        (PoolKey memory k, MockToken t) = _mk(10, 3000);
        _buy(t, 1 ether, 30_000_000);
        _sell(t, 1 ether, 30_000_000);
        uint256 g0;
        (, fairSmallSell) = _q(address(t), address(weth), SMALL);
        (g0, fairSell) = _q(address(t), address(weth), LARGE);
        (, fairBuy) = _q(address(weth), address(t), LARGE);
        assertGt(fairSell, 0);
        assertGt(fairBuy, 0);

        // 60 positions above the price (6% of price) and 250 below it (22%)
        console2.log("gas the outsider paid for 310 dust positions:", _dust(k, 60, true) + _dust(k, 250, false));

        (, uint256 smallSell) = _q(address(t), address(weth), SMALL);
        assertApproxEqRel(smallSell, fairSmallSell, 1e12, "small trades are not affected");
        (uint256 g1, uint256 sellNow) = _q(address(t), address(weth), LARGE);
        (uint256 g2, uint256 buyNow) = _q(address(weth), address(t), LARGE);
        console2.log("150 T -> ETH: quote before / after the dust:", fairSell, sellNow);
        console2.log("150 ETH -> T: quote before / after the dust:", fairBuy, buyNow);
        console2.log("quote gas before / after (sell) / after (buy):", g0, g1, g2);
        assertEq(sellNow, 0, "the pinned real pool no longer quotes the large sell");
        assertEq(buyNow, 0, "nor the large buy");
        (bool ok,) = _sell(t, LARGE, 30_000_000);
        assertFalse(ok, "and the swap reverts (NoPath)");
        _worsePoolBeside(t);
    }

    /// A worse pool beside the pinned one: 300 ETH + 300 T, 1% fee, spacing 200. Before the cap it could not win.
    function _worsePoolBeside(MockToken t) internal {
        PoolKey memory j = PoolKey(address(0), address(t), 10000, 200, address(0));
        IPM(PM).initialize(j, MID);
        lp.modify(j, -887200, 887200, 300e18);
        vm.prank(keeper);
        v3.register(j);
        (, uint256 viaJunk) = _q(address(t), address(weth), LARGE);
        console2.log("150 T -> ETH with the worse pool listed: quote:", viaJunk);
        assertGt(viaJunk, 0);
        console2.log("  as a share of the real pool's quote, in bps:", viaJunk * 10_000 / fairSell);
        assertLt(viaJunk, fairSell * 80 / 100, "under 80% of what the real pool pays");
        (bool ok, uint256 got) = _sell(t, LARGE, 30_000_000);
        assertTrue(ok);
        assertEq(got, viaJunk, "the swap pays the worse pool's price");
        (, uint256 smallAgain) = _q(address(t), address(weth), SMALL);
        assertApproxEqRel(smallAgain, fairSmallSell, 1e12, "small trades still use the real pool");
    }

    /// Two runaway keys ahead of the real pool, Robinhood Chain's PoolManager code: at every gas limit the quote
    /// either reverts or is the real pool's, and every completed swap pays the real pool's price.
    function test_followup_lowGas_sweepOnTheRealPoolManager() public {
        MockToken t = new MockToken("T2", 18);
        PoolKey memory real = PoolKey(address(0), address(t), 3000, 60, address(0));
        PoolKey memory j1 = PoolKey(address(0), address(t), 101, 1, address(0));
        PoolKey memory j2 = PoolKey(address(0), address(t), 102, 1, address(0));
        IPM(PM).initialize(real, MID);
        IPM(PM).initialize(j1, HIGHEST);
        IPM(PM).initialize(j2, HIGHEST);
        t.mint(address(lp), 1e24);
        lp.modify(real, -887220, 887220, 1000e18);
        vm.startPrank(keeper);
        v3.register(j1);
        v3.register(j2);
        v3.register(real);
        vm.stopPrank();
        (, uint256 fair) = _q(address(weth), address(t), 1 ether);
        assertGt(fair, 0);

        uint256 firstOk;
        uint256 nLow;
        uint256 nOut;
        for (uint256 g = 200_000; g <= 7_400_000; g += 150_000) {
            vm.cool(PM);
            (bool ok, bytes memory ret) =
                address(v3).call{gas: g}(abi.encodeCall(v3.quote, (address(weth), address(t), 1 ether)));
            if (ok) {
                assertEq(abi.decode(ret, (uint256)), fair, "an answered quote is the real pool's");
                if (firstOk == 0) firstOk = g;
            } else {
                assertEq(firstOk, 0, "a failure above the first success");
                if (ret.length == 4 && bytes4(ret) == UniswapV4AdapterV3.LowGas.selector) ++nLow;
                else ++nOut;
            }
        }
        console2.log("quote: lowest gas limit that answered / LowGas reverts / other reverts:", firstOk, nLow, nOut);

        uint256 firstSwap;
        for (uint256 g = 300_000; g <= 9_000_000; g += 300_000) {
            uint256 snap = vm.snapshotState();
            (bool ok, uint256 got) = _buy(t, 1 ether, g);
            if (ok) {
                assertEq(got, fair, "a completed swap pays the real pool's price");
                if (firstSwap == 0) firstSwap = g;
            } else {
                assertEq(firstSwap, 0, "a failure above the first success");
            }
            vm.revertToState(snap);
        }
        console2.log("swap: lowest gas limit that completed (two runaway keys ahead):", firstSwap);
    }
}
