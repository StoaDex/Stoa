// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {UniswapV3Adapter, IUniswapV3Factory} from "../src/adapters/UniswapV3Adapter.sol";
import {UniswapV3AdapterV2Elysium as UniswapV3AdapterV2} from "../src/adapters/UniswapV3AdapterV2Elysium.sol";
import {ICLTickSpacingFactory} from "../src/adapters/CLTickSpacingAdapter.sol";
import {
    CLTickSpacingAdapterV2Elysium as CLTickSpacingAdapterV2
} from "../src/adapters/CLTickSpacingAdapterV2Elysium.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";
import {IPoolManager, PoolKey} from "../src/adapters/UniswapV4Adapter.sol";
import {IVenueAdapter} from "../src/interfaces/IStoa.sol";
import {MockToken} from "./mocks/Mocks.sol";
import {IV3FactoryFull, IPoolMint, Lp} from "./AdapterSimGas.t.sol";
import {VenuesElysium} from "../script/VenuesElysium.sol";
import {RolloutSimGasElysium, ElysiumLive} from "../script/RolloutSimGasElysium.s.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";

/// @notice The gas-capped adapters for the Elysium router (script/DeploySimGasElysium.s.sol) on an Elysium fork: a
///         griefed pair stays cheap to quote, live quotes match the adapters they replace, and the timelock operations
///         built by RolloutSimGasElysium swap them in through the real Safe. Skipped unless ELYSIUM_RPC_URL is set.
contract ElysiumSimGasTest is Test, VenuesElysium, ElysiumLive {
    uint160 constant P1 = 79228162514264337593543950336;
    int24 constant MAXT = 887272;
    StoaRouter router = StoaRouter(payable(ELY_ROUTER));
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ELYSIUM_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        // Elysium's Aero pools call ArbSys at 0x64; without it every Aero simulation fails on both adapters
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        on = true;
    }

    function _new() internal returns (address[] memory ads) {
        ads = new address[](4);
        ads[0] = address(new UniswapV3AdapterV2(IUniswapV3Factory(UNI_V3_FACTORY), WHYPE, ELY_ROUTER));
        ads[1] = address(new CLTickSpacingAdapterV2(ICLTickSpacingFactory(AERO_CL_FACTORY), ELY_ROUTER, aeroSpacings()));
        ads[2] =
            address(new CLTickSpacingAdapterV2(ICLTickSpacingFactory(RAMSES_CL_FACTORY), ELY_ROUTER, ramsesSpacings()));
        ads[3] = address(
            new UniswapV4AdapterV3(
                IPoolManager(V4_POOL_MANAGER), WHYPE, ELY_ROUTER, ELY_TIMELOCK, v4Hooks(), ELY_KEEPER, router.guardian()
            )
        );
    }

    /// The keeper copies the old V4 adapter's keys (script/data/v4-v3-seed-99901.json), as the deploy workflow does.
    /// Returns how many it registered; a key V3 refuses is counted in `refused` and logged.
    function _copyKeys(UniswapV4AdapterV3 v4, uint256 max) internal returns (uint256 n, uint256 refused) {
        string memory j = vm.readFile("script/data/v4-v3-seed-99901.json");
        vm.startPrank(ELY_KEEPER);
        for (uint256 i; i < max; ++i) {
            string memory k = string.concat("[", vm.toString(i), "]");
            if (!vm.keyExistsJson(j, k)) break;
            PoolKey memory key = PoolKey({
                currency0: vm.parseJsonAddress(j, string.concat(k, ".currency0")),
                currency1: vm.parseJsonAddress(j, string.concat(k, ".currency1")),
                fee: uint24(vm.parseJsonUint(j, string.concat(k, ".fee"))),
                tickSpacing: int24(vm.parseJsonInt(j, string.concat(k, ".tickSpacing"))),
                hooks: vm.parseJsonAddress(j, string.concat(k, ".hooks"))
            });
            try v4.register(key) {
                ++n;
            } catch {
                ++refused;
                console2.log("refused key", i);
            }
        }
        vm.stopPrank();
    }

    function test_fork_elysium_v3_griefedPairStaysUsable() public {
        if (!on) return vm.skip(true);
        MockToken x = new MockToken("X", 18);
        MockToken y = new MockToken("Y", 18);
        Lp lp = new Lp();
        x.mint(address(lp), 1e30);
        y.mint(address(lp), 1e30);
        uint24[4] memory fees = [uint24(3000), 100, 500, 10000];
        int24[4] memory sps = [int24(60), 1, 10, 200];
        for (uint256 i; i < 4; ++i) {
            address p = IV3FactoryFull(UNI_V3_FACTORY).createPool(address(x), address(y), fees[i]);
            IPoolMint(p).initialize(P1);
            if (i == 0) lp.mint(p, -(MAXT / 60) * 60, (MAXT / 60) * 60, 1e24); // the real market
            else lp.mint(p, -sps[i], sps[i], 1e6); // dust griefing pools
        }
        UniswapV3Adapter old = new UniswapV3Adapter(IUniswapV3Factory(UNI_V3_FACTORY), WHYPE, address(this));
        UniswapV3AdapterV2 v2 = new UniswapV3AdapterV2(IUniswapV3Factory(UNI_V3_FACTORY), WHYPE, address(this));

        uint256 g = gasleft();
        uint256 qOld = old.quote(address(x), address(y), 1e18);
        uint256 gOld = g - gasleft();
        g = gasleft();
        uint256 qNew = v2.quote(address(x), address(y), 1e18);
        uint256 gNew = g - gasleft();
        console2.log("Elysium V3 quote gas old / new:", gOld, gNew);
        assertEq(qNew, qOld, "same best quote");
        assertGt(gOld, 20_000_000, "the original adapter walks the tick bitmaps");
        assertLt(gNew, 4_000_000, "capped");
    }

    /// Live WHYPE/USDC on each venue. The old adapters are called with 50M gas (a common eth_call cap): where they
    /// finish, the new adapter must give the same quote; where they do not, the new one must still answer cheaply.
    function test_fork_elysium_liveQuotes() public {
        if (!on) return vm.skip(true);
        address[] memory ads = _new();
        address[3] memory old = [ELY_OLD_V3, ELY_OLD_AERO, ELY_OLD_RAMSES];
        uint256[3] memory sizes = [uint256(0.1 ether), 10 ether, 500 ether];
        for (uint256 v; v < 3; ++v) {
            for (uint256 i; i < sizes.length; ++i) {
                for (uint256 dir; dir < 2; ++dir) {
                    (address tin, address tout, uint256 amt) =
                        dir == 0 ? (WHYPE, USDC, sizes[i]) : (USDC, WHYPE, sizes[i] * 66 / 1e12);
                    uint256 g = gasleft();
                    uint256 b = IVenueAdapter(ads[v]).quote{gas: 20_000_000}(tin, tout, amt);
                    uint256 gB = g - gasleft();
                    g = gasleft();
                    (bool ok, bytes memory r) =
                        old[v].call{gas: 50_000_000}(abi.encodeCall(IVenueAdapter.quote, (tin, tout, amt)));
                    uint256 gA = g - gasleft();
                    console2.log("venue / dir / amount", v, dir, amt);
                    console2.log("  gas old / new", gA, gB);
                    assertLt(gB, 15_000_000, "new adapter stays cheap");
                    if (ok) {
                        uint256 a = abi.decode(r, (uint256));
                        console2.log("  out old / new", a, b);
                        assertEq(b, a, "same quote where the old adapter finishes");
                    } else {
                        console2.log("  old adapter ran out of 50M gas; new out", b);
                    }
                }
            }
        }
    }

    /// Large HYPE sells on Aero HYPE/USDC, the only venue for them: at 1M per simulation the capped adapter had no quote
    /// for about 2,000 HYPE; at 1.5M it quotes what the uncapped adapter quotes.
    function test_fork_elysium_aeroLargeHypeSell() public {
        if (!on) return vm.skip(true);
        address aero = _new()[1];
        uint256[3] memory sizes = [uint256(1_500 ether), 2_000 ether, 2_200 ether];
        for (uint256 i; i < sizes.length; ++i) {
            uint256 b = IVenueAdapter(aero).quote{gas: 30_000_000}(WHYPE, USDC, sizes[i]);
            (bool ok, bytes memory r) =
                ELY_OLD_AERO.call{gas: 50_000_000}(abi.encodeCall(IVenueAdapter.quote, (WHYPE, USDC, sizes[i])));
            uint256 a = ok ? abi.decode(r, (uint256)) : 0;
            console2.log("HYPE in / USDC out old, new", sizes[i] / 1e18, a, b);
            if (i < 2) assertGt(b, 0, "quotes a large HYPE sell");
            if (ok && a > 0 && b > 0) assertEq(b, a, "same quote as the uncapped adapter");
        }
    }

    /// The most traded V4 pools (script/data/v4-seed-pools.json): each is registered on V3, and V3 quotes at least what
    /// the old adapter does. (Not "equal": once V3 holds only the keeper's keys, a stranger who pushes a top pool off the
    /// old adapter makes the old one quote less, or nothing, while V3 still quotes the real pool.)
    function test_fork_elysium_v4_liveQuotesUnchanged() public {
        if (!on) return vm.skip(true);
        UniswapV4AdapterV3 v4 = UniswapV4AdapterV3(payable(_new()[3]));
        (uint256 n, uint256 refused) = _copyKeys(v4, type(uint256).max);
        console2.log("V4 keys copied / refused", n, refused);
        assertEq(refused, 0, "every key of the old adapter fits V3");
        string memory j = vm.readFile("script/data/v4-seed-pools.json");
        for (uint256 i; i < 6; ++i) {
            string memory k = string.concat("[", vm.toString(i), "]");
            PoolKey memory want = PoolKey({
                currency0: vm.parseJsonAddress(j, string.concat(k, ".currency0")),
                currency1: vm.parseJsonAddress(j, string.concat(k, ".currency1")),
                fee: uint24(vm.parseJsonUint(j, string.concat(k, ".fee"))),
                tickSpacing: int24(vm.parseJsonInt(j, string.concat(k, ".tickSpacing"))),
                hooks: vm.parseJsonAddress(j, string.concat(k, ".hooks"))
            });
            address a = want.currency0 == address(0) ? WHYPE : want.currency0;
            PoolKey[] memory have = v4.keysFor(a, want.currency1);
            bool found;
            for (uint256 h; h < have.length; ++h) {
                if (v4.poolId(have[h]) == v4.poolId(want)) found = true;
            }
            assertTrue(found, "ranked pool registered on V3");
            address tok = a == WHYPE ? want.currency1 : a;
            if (a != WHYPE && want.currency1 != WHYPE) continue;
            uint256 qOld = IVenueAdapter(ELY_OLD_V4).quote(WHYPE, tok, 1 ether);
            uint256 qNew = IVenueAdapter(address(v4)).quote(WHYPE, tok, 1 ether);
            console2.log("HYPE->token old / new", qOld, qNew);
            assertGe(qNew, qOld, "V3 quotes at least what the old adapter does");
        }
    }

    /// The exact operations the hourly workflow schedules, run through the real Safe and timelock.
    function test_fork_elysium_rolloutThroughTimelock() public {
        if (!on) return vm.skip(true);
        address[] memory ads = _new();
        _copyKeys(UniswapV4AdapterV3(payable(ads[3])), type(uint256).max);
        assertEq(new RolloutSimGasElysium().missingV4Keys(ads[3]), 0, "every copied pair has a key on V3");
        // a launchpad token that trades on V4 (the most traded pool of the seed)
        string memory sj = vm.readFile("script/data/v4-seed-pools.json");
        address memeTok = vm.parseJsonAddress(sj, "[0].currency1");
        RolloutSimGasElysium r = new RolloutSimGasElysium();
        (RolloutSimGasElysium.Op memory a, RolloutSimGasElysium.Op memory b) = r.opsFor(ads);
        TimelockController tl = TimelockController(payable(ELY_TIMELOCK));
        uint256 d = tl.getMinDelay();
        uint256 margin = 1 hours;

        vm.startPrank(ELY_SAFE);
        tl.scheduleBatch(a.targets, a.values, a.payloads, a.predecessor, a.salt, d);
        tl.scheduleBatch(b.targets, b.values, b.payloads, b.predecessor, b.salt, d + router.delay() + margin);
        vm.warp(block.timestamp + d);
        tl.executeBatch(a.targets, a.values, a.payloads, a.predecessor, a.salt);
        vm.expectRevert(); // B is not ready until the router's 1-day wait (plus margin) has passed
        tl.executeBatch(b.targets, b.values, b.payloads, b.predecessor, b.salt);
        vm.warp(block.timestamp + router.delay() + margin);
        // "before" is read at the same time as "after": Aero's fee moves with the clock, so across the 73h warp the
        // two would differ by a few millionths for reasons that have nothing to do with the adapters
        uint256 before = router.quote(address(0), USDC, 1 ether).amountOut;
        uint256 memeBefore = router.quote(address(0), memeTok, 0.1 ether).amountOut;
        tl.executeBatch(b.targets, b.values, b.payloads, b.predecessor, b.salt);
        vm.stopPrank();

        for (uint256 i; i < 4; ++i) {
            assertTrue(router.isAdapter(ads[i]), "new adapter in");
        }
        assertFalse(router.isAdapter(ELY_OLD_V4), "old V4 out");
        uint256 memeAfter = router.quote(address(0), memeTok, 0.1 ether).amountOut;
        console2.log("router HYPE->top V4 token before / after:", memeBefore, memeAfter);
        // at least as good: if an outsider pushed the keeper's key off the old adapter, V3's copy of the real pool quotes more
        assertGe(memeAfter, memeBefore, "V4 routing at least as good");
        assertFalse(router.isAdapter(ELY_OLD_V3), "old V3 out");
        assertFalse(router.isAdapter(ELY_OLD_AERO), "old Aero out");
        assertFalse(router.isAdapter(ELY_OLD_RAMSES), "old Ramses out");

        StoaRouter.Quote memory q = router.quote(address(0), USDC, 1 ether);
        console2.log("router HYPE->USDC before / after:", before, q.amountOut);
        assertEq(q.amountOut, before, "same quote as today");

        address alice = makeAddr("alice");
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        uint256 out = router.swap{value: 1 ether}(
            StoaRouter.SwapParams({
                tokenIn: address(0),
                tokenOut: USDC,
                mid: q.mid,
                leg1: q.leg1,
                leg2: q.leg2,
                amountIn: 1 ether,
                minOut: q.amountOut * 995 / 1000,
                to: alice,
                deadline: block.timestamp + 60,
                referrer: address(0)
            })
        );
        console2.log("swap out via", q.leg1.venue, out);
        assertGe(out, q.amountOut * 995 / 1000);
        assertEq(IERC20(USDC).balanceOf(alice), out);
    }
}
