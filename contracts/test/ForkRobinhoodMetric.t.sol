// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/Test.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {MetricAdapter, IMetricFactory, IMetricQuoter} from "../src/adapters/MetricAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VenuesRobinhood} from "../script/VenuesRobinhood.sol";
import {VenuePackageRobinhood} from "../script/VenuePackageRobinhood.sol";

/// @notice MetricAdapter against the LIVE Metric OMM pools on Robinhood Chain (WETH/USDG and tokenized stocks), with
///         the ordered pool lists the keeper script ranks per direction (script/data/metric-pools-4663.json), then
///         through the live router once the timelock has added the adapter.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodMetric -vv
contract ForkRobinhoodMetricTest is RouterHelper, VenuesRobinhood, VenuePackageRobinhood {
    address constant METRIC_FACTORY = 0x2a53833cc95548cf52c7b159110e22D3a9018f32;
    address constant METRIC_QUOTER = 0x3B9ea79f482094323d06064E637a7F4528560fcb;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    MetricAdapter metric;
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        metric = new MetricAdapter(
            IMetricFactory(METRIC_FACTORY), IMetricQuoter(METRIC_QUOTER), LIVE_ROUTER, LIVE_TIMELOCK, keeper
        );
        string memory json = vm.readFile("script/data/metric-pools-4663.json");
        uint256 n;
        while (vm.keyExistsJson(json, string.concat("$[", vm.toString(n), "]"))) ++n;
        for (uint256 i; i < n; ++i) {
            string memory k = string.concat("$[", vm.toString(i), "]");
            address tin = vm.parseJsonAddress(json, string.concat(k, ".tokenIn"));
            address tout = vm.parseJsonAddress(json, string.concat(k, ".tokenOut"));
            address[] memory ps = vm.parseJsonAddressArray(json, string.concat(k, ".pools"));
            vm.prank(keeper);
            metric.setPools(tin, tout, ps);
        }
        vm.deal(alice, 100 ether);
    }

    /// @dev Quotes run as the web and the API run them: eth_call with no sender, so tx.origin is zero. Some Metric
    ///      oracles answer only such simulations or a pool that is mid-swap.
    function _quote(address a, address b, uint256 amt) internal returns (uint256) {
        vm.prank(alice, address(0));
        return metric.quote(a, b, amt);
    }

    function _routerQuote(address a, address b, uint256 amt) internal returns (StoaRouter.Quote memory) {
        vm.prank(alice, address(0));
        return router.quote(a, b, amt);
    }

    /// @dev Swap along the route of `q`, as the web app does: it sends the route it quoted (RouterHelper's `_swapAs`
    ///      would quote again with a sender, which those oracles refuse, and pick another route).
    function _swapQuoted(StoaRouter.Quote memory q, address tin, address tout, uint256 amt) internal returns (uint256) {
        StoaRouter.SwapParams memory p = StoaRouter.SwapParams({
            tokenIn: tin,
            tokenOut: tout,
            mid: q.mid,
            leg1: q.leg1,
            leg2: q.leg2,
            amountIn: amt,
            minOut: q.amountOut,
            to: alice,
            deadline: block.timestamp,
            referrer: address(0)
        });
        vm.prank(alice);
        return router.swap{value: tin == address(0) ? amt : 0}(p);
    }

    /// @dev Metric's own quoter on one pool: the output if it fills the whole input, else 0.
    function _q(address pool, address a, uint256 amt) internal returns (uint256) {
        (bool ok, bytes memory r) = pool.staticcall(abi.encodeWithSignature("getImmutables()"));
        require(ok, "pool");
        (, address p0) = abi.decode(r, (address, address));
        bool z = a == p0;
        vm.prank(alice, address(0));
        try IMetricQuoter(METRIC_QUOTER)
            .quoteLiveExactInSingle(pool, address(metric), z, uint128(amt), z ? 0 : type(uint128).max) returns (
            uint256 qi, uint256 qo
        ) {
            return qi == amt ? qo : 0;
        } catch {
            return 0;
        }
    }

    /// @dev (first listed pool that fills, best listed pool)
    function _listed(address a, address b, uint256 amt) internal returns (uint256 first, uint256 best) {
        address[] memory ps = metric.poolsFor(a, b);
        for (uint256 i; i < ps.length; ++i) {
            uint256 o = _q(ps[i], a, amt);
            if (first == 0) first = o;
            if (o > best) best = o;
        }
    }

    function test_fork_quotesMatchMetricsQuoter() public {
        if (!on) return vm.skip(true);
        uint256[3] memory sizes = [uint256(0.01 ether), 0.1 ether, 1 ether];
        for (uint256 i; i < 3; ++i) {
            uint256 q = _quote(WETH, USDG, sizes[i]);
            (uint256 first, uint256 best) = _listed(WETH, USDG, sizes[i]);
            assertEq(q, first, "adapter = first listed pool that fills");
            if (best > 0) console2.log("  best listed pool pays more by (bps x100):", (best - q) * 1e6 / best);
            uint256 today = _routerQuote(address(0), USDG, sizes[i]).amountOut;
            console2.log("WETH in (wei):", sizes[i]);
            console2.log("  metric USDG (before the router fee):", q, " live router today:", today);
            assertGt(q, 0, "metric quotes WETH/USDG");
        }
        assertGt(_quote(USDG, WETH, 1000e6), 0, "metric quotes USDG -> WETH");
        console2.log("500 USDG -> TSLA on metric (0 while its oracle is closed):", _quote(USDG, TSLA, 500e6));
        assertEq(_quote(USDG, makeAddr("nothing"), 1e6), 0, "no pools, no quote");
    }

    function test_fork_swapPaysTheQuoteAndKeepsNothing() public {
        if (!on) return vm.skip(true);
        uint256 amt = 1 ether;
        uint256 q = _quote(WETH, USDG, amt);
        deal(WETH, address(metric), amt); // the router sends the input before calling swap
        vm.prank(LIVE_ROUTER);
        uint256 got = metric.swap(WETH, USDG, amt, q, alice);
        assertEq(got, q, "fills at the quote");
        assertEq(IERC20(USDG).balanceOf(alice), q, "output to the recipient");
        assertEq(IERC20(WETH).balanceOf(address(metric)), 0, "no input left behind");
        assertEq(IERC20(USDG).balanceOf(address(metric)), 0, "no output left behind");

        uint256 usd = 500e6;
        uint256 qt = _quote(USDG, TSLA, usd);
        if (qt == 0) return; // stock oracle closed or pool empty: nothing to fill
        deal(USDG, address(metric), usd);
        vm.prank(LIVE_ROUTER);
        metric.swap(USDG, TSLA, usd, qt, alice);
        assertEq(IERC20(TSLA).balanceOf(alice), qt, "tokenized stock bought at the quote");
        assertEq(IERC20(USDG).balanceOf(address(metric)), 0, "no USDG left behind");
    }

    function test_fork_onlyRouterAndOnlyActivePoolCallback() public {
        if (!on) return vm.skip(true);
        vm.expectRevert(MetricAdapter.OnlyRouter.selector);
        metric.swap(WETH, USDG, 1 ether, 0, alice);
        address pool = metric.poolsFor(WETH, USDG)[0];
        vm.prank(pool); // a real pool, but not mid-swap
        vm.expectRevert(MetricAdapter.BadCallback.selector);
        metric.metricOmmSwapCallback(1, -1, "");
    }

    function test_fork_rejectsOtherPairsAndForeignPools() public {
        if (!on) return vm.skip(true);
        address[] memory ps = metric.poolsFor(WETH, USDG);
        address[] memory one = new address[](1);
        one[0] = ps[0];
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MetricAdapter.WrongPair.selector, ps[0]));
        metric.setPools(USDG, TSLA, one);
        one[0] = LIVE_ROUTER; // not a Metric pool
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MetricAdapter.NotMetricPool.selector, LIVE_ROUTER));
        metric.setPools(WETH, USDG, one);
        vm.prank(alice);
        vm.expectRevert(MetricAdapter.NotKeeper.selector);
        metric.setPools(WETH, USDG, ps);
    }

    /// Tokenized-stock pools read an oracle that only answers a pool mid-swap or a simulation with no sender
    /// (tx.origin zero), which is how the web and the API quote (eth_call without `from`). So: quote as a
    /// simulation, then swap as the router does in a real transaction.
    function test_fork_stockPoolsQuoteInSimulationAndSwapForAnyone() public {
        if (!on) return vm.skip(true);
        string memory json = vm.readFile("script/data/metric-pools-4663.json");
        uint256 filled;
        for (uint256 i; vm.keyExistsJson(json, string.concat("$[", vm.toString(i), "]")); ++i) {
            string memory k = string.concat("$[", vm.toString(i), "]");
            address tin = vm.parseJsonAddress(json, string.concat(k, ".tokenIn"));
            address tout = vm.parseJsonAddress(json, string.concat(k, ".tokenOut"));
            if (tin != USDG || tout == WETH) continue;
            uint256 amt = 100e6;
            uint256 q = _quote(USDG, tout, amt);
            if (q == 0) continue; // closed or empty right now
            uint256 snap = vm.snapshotState();
            deal(USDG, address(metric), amt);
            vm.prank(LIVE_ROUTER);
            uint256 got = metric.swap(USDG, tout, amt, q, alice);
            assertEq(got, q, "stock bought at the simulated quote");
            assertEq(IERC20(USDG).balanceOf(address(metric)), 0, "no USDG left behind");
            vm.revertToState(snap);
            ++filled;
        }
        console2.log("USDG -> tokenized stock directions filled:", filled);
    }

    /// One pool swap per fill: no on-chain quotes (the first version quoted every listed pool first: ~578k gas).
    function test_fork_swapGas() public {
        if (!on) return vm.skip(true);
        uint256[3] memory sizes = [uint256(0.01 ether), 0.1 ether, 1 ether];
        for (uint256 i; i < 3; ++i) {
            uint256 snap = vm.snapshotState();
            uint256 q = _quote(WETH, USDG, sizes[i]);
            deal(WETH, address(metric), sizes[i]);
            vm.prank(LIVE_ROUTER);
            uint256 g = gasleft();
            uint256 got = metric.swap(WETH, USDG, sizes[i], q, alice);
            uint256 used = g - gasleft();
            console2.log("adapter.swap WETH -> USDG", sizes[i], "gas", used);
            assertEq(got, q, "fills at the quote");
            assertLt(used, 450_000, "one pool swap, or one more after a paused first pool");
            vm.revertToState(snap);
        }
        uint256 usd = 2_000e6;
        uint256 qu = _quote(USDG, WETH, usd);
        if (qu == 0) return; // every listed pool paused right now
        deal(USDG, address(metric), usd);
        vm.prank(LIVE_ROUTER);
        uint256 g2 = gasleft();
        assertEq(metric.swap(USDG, WETH, usd, qu, alice), qu);
        console2.log("adapter.swap 2000 USDG -> WETH gas", g2 - gasleft());
    }

    /// The timelock adds the adapter to the live router (propose, wait, execute); then a real ETH swap uses Metric
    /// whenever it quotes more than every other venue.
    function test_fork_liveRouterSwapsThroughMetric() public {
        if (!on) return vm.skip(true);
        uint256 now_ = block.timestamp;
        vm.prank(LIVE_TIMELOCK);
        router.propose(false, address(metric));
        vm.warp(now_ + router.delay() + 1);
        vm.prank(LIVE_TIMELOCK);
        router.execute(false, address(metric));
        vm.warp(now_); // back to the fork's time, so oracle prices are fresh again
        assertTrue(router.isAdapter(address(metric)), "metric is a router venue");

        uint256 amt = 1 ether;
        StoaRouter.Quote memory q = _routerQuote(address(0), USDG, amt);
        console2.log("router quote 1 ETH -> USDG:", q.amountOut);
        console2.log("leg1 venue:", q.leg1.venue);
        uint256 before = IERC20(USDG).balanceOf(alice);
        uint256 g = gasleft();
        uint256 out = _swapQuoted(q, address(0), USDG, amt);
        console2.log("swap gas:", g - gasleft());
        assertEq(IERC20(USDG).balanceOf(alice) - before, out, "paid");
        assertGe(out, q.amountOut, "at least the quote");
        assertEq(IERC20(WETH).balanceOf(address(metric)), 0, "adapter keeps nothing");

        // USDG -> TSLA: the router takes Metric or another venue, whichever pays more after its fee
        deal(USDG, alice, 500e6);
        vm.prank(alice);
        IERC20(USDG).approve(LIVE_ROUTER, 500e6);
        StoaRouter.Quote memory qs = _routerQuote(USDG, TSLA, 500e6);
        uint256 viaMetric = _quote(USDG, TSLA, 500e6);
        console2.log("500 USDG -> TSLA, router:", qs.amountOut, " metric alone:", viaMetric);
        console2.log("  venue:", qs.leg1.venue);
        assertGe(qs.amountOut, viaMetric - viaMetric * router.fallbackFeeBps() / 10_000, "never below metric");
        uint256 tsla = _swapQuoted(qs, USDG, TSLA, 500e6);
        assertGe(tsla, qs.amountOut);
    }
}
