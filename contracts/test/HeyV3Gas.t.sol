// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";
import {MockToken, MockWHYPE} from "./mocks/Mocks.sol";

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IPM {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
    function unlock(bytes calldata data) external returns (bytes memory);
    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory params, bytes calldata hookData)
        external
        returns (int256 callerDelta, int256 feesAccrued);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @dev Adds or removes liquidity on a native-ETH/token pool, the way any liquidity provider can.
contract HeyLp {
    IPM immutable pm;

    constructor(IPM pm_) {
        pm = pm_;
    }

    receive() external payable {}

    function modify(PoolKey memory key, int24 lo, int24 hi, int256 liq) external {
        pm.unlock(abi.encode(key, lo, hi, liq));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, int24 lo, int24 hi, int256 liq) = abi.decode(data, (PoolKey, int24, int24, int256));
        (int256 d,) = pm.modifyLiquidity(key, ModifyLiquidityParams(lo, hi, liq, bytes32(0)), "");
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        if (d0 < 0) pm.settle{value: uint128(-d0)}();
        if (d0 > 0) pm.take(address(0), address(this), uint128(d0));
        if (d1 < 0) {
            pm.sync(key.currency1);
            IERC20(key.currency1).transfer(address(pm), uint128(-d1));
            pm.settle();
        }
        if (d1 > 0) pm.take(key.currency1, address(this), uint128(d1));
        return "";
    }
}

/// @dev Added to Stoa's repo from HEY Research Lab's review (17 Nov 2026). Stoa's changes: the constructor's new guardian
///      argument, and the assertions of the
///      four tests marked "After the fix": at b0fd23b they showed L-1 (no gas cap); with SIM_GAS they check it is gone.
/// @notice HEY Research Lab pre-deploy review of UniswapV4AdapterV3 (commit b0fd23b): what a junk key costs in gas
///         now that a key is never evicted. Fully local: the test runs Robinhood Chain's PoolManager runtime code
///         (read with `cast code`, saved in test/data/poolmanager-4663-runtime.hex) at its own address with empty
///         storage, so every pool here is created by the test. No fork, no network.
contract HeyV3GasTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint256 constant TX_GAS_CAP = 32_000_000; // Robinhood Chain per-transaction limit (ArbGasInfo, 17 Nov 2026)
    uint160 constant MID = uint160(1) << 96; // price 1, tick 0
    uint160 constant LOWEST = 4295128740;
    uint160 constant HIGHEST = 1461446703485210103287233400603844494775084016;

    UniswapV4AdapterV3 v3;
    MockWHYPE weth;
    MockToken tok;
    HeyLp lp;
    address timelock = makeAddr("timelock");
    address keeper = makeAddr("keeper");
    address router = makeAddr("router");
    address outsider = makeAddr("outsider");

    function setUp() public {
        vm.etch(PM, vm.parseBytes(vm.trim(vm.readFile("test/data/poolmanager-4663-runtime.hex"))));
        weth = new MockWHYPE();
        tok = new MockToken("TOK", 18);
        lp = new HeyLp(IPM(PM));
        address[] memory hooks = new address[](1); // hook-less pools
        v3 = new UniswapV4AdapterV3(
            IPoolManager(PM), address(weth), router, timelock, hooks, keeper, makeAddr("guardian")
        );

        // the pair's real pool: ETH/TOK, fee 0.3%, spacing 60, 1,000 ETH + 1,000 TOK of full-range liquidity
        IPM(PM).initialize(_real(), MID);
        tok.mint(address(lp), 1e24);
        vm.deal(address(lp), 1e24);
        lp.modify(_real(), -887220, 887220, 1000e18);
        vm.prank(keeper);
        v3.register(_real());
        vm.prank(timelock);
        v3.setPinned(_real(), true);
    }

    function _real() internal view returns (PoolKey memory) {
        return PoolKey(address(0), address(tok), 3000, 60, address(0));
    }

    function _junk(uint24 fee, int24 spacing) internal view returns (PoolKey memory) {
        return PoolKey(address(0), address(tok), fee, spacing, address(0));
    }

    function _quoteGas(address a, address b, uint256 amt) internal returns (uint256 used, uint256 out) {
        vm.cool(PM); // every measurement starts with cold PoolManager storage, as a fresh transaction would
        uint256 g = gasleft();
        out = v3.quote(a, b, amt);
        used = g - gasleft();
    }

    function _swapAsRouter(uint256 amt, uint256 gasLimit) internal returns (bool ok, uint256 got) {
        vm.deal(address(this), amt);
        weth.deposit{value: amt}();
        weth.transfer(address(v3), amt);
        uint256 b0 = tok.balanceOf(address(this));
        vm.cool(PM);
        vm.prank(router);
        (ok,) = address(v3).call{gas: gasLimit}(
            abi.encodeCall(v3.swap, (address(weth), address(tok), amt, 0, address(this)))
        );
        got = tok.balanceOf(address(this)) - b0;
    }

    /// The cost of one empty hook-less key beside the real pool, by tick spacing. Anyone can create these pools.
    function test_gas_oneEmptyKey_bySpacing() public {
        uint256 amt = 1 ether;
        (uint256 g0, uint256 fair) = _quoteGas(address(weth), address(tok), amt);
        console2.log("quote gas, real pool only:", g0);
        int24[5] memory spacings = [int24(200), 60, 10, 5, 1];
        for (uint256 i; i < spacings.length; ++i) {
            PoolKey memory k = _junk(uint24(100 + i), spacings[i]);
            vm.prank(outsider);
            IPM(PM).initialize(k, MID);
            vm.prank(keeper);
            v3.register(k);
            (uint256 g, uint256 out) = _quoteGas(address(weth), address(tok), amt);
            assertEq(out, fair, "with unlimited gas an empty key does not change the quote");
            console2.log("  + one empty key at mid price, spacing / quote gas:", uint256(int256(spacings[i])), g);
            vm.prank(keeper);
            v3.unregister(k);
        }
    }

    /// A key does not have to be empty: a junk pool that is deep enough for a small test quote still walks the
    /// bitmap for any larger amount (it cannot fill it, so the swap runs on to the price limit).
    function test_gas_thinKeyPassesASmallQuote_andWalksOnALargerOne() public {
        PoolKey memory k = _junk(500, 1);
        vm.prank(outsider);
        IPM(PM).initialize(k, MID);
        tok.mint(address(lp), 10e18);
        lp.modify(k, -1000, 1000, 2e18); // about 0.1 ETH + 0.1 TOK within +-10%
        vm.prank(keeper);
        v3.register(k);
        (uint256 gs, uint256 small) = _quoteGas(address(weth), address(tok), 0.05 ether);
        (uint256 gb, uint256 big) = _quoteGas(address(weth), address(tok), 1 ether);
        console2.log("thin spacing-1 key: gas of a 0.05 ETH quote / out:", gs, small);
        console2.log("thin spacing-1 key: gas of a 1 ETH quote / out:   ", gb, big);
        assertGt(small, 0);
        // After the fix: at b0fd23b the 1 ETH quote cost 18.7M (assertGt(gb, 5_000_000)). Now the walk stops at
        // SIM_GAS and the real pool still answers.
        assertLt(gb, v3.SIM_GAS() + 1_000_000);
        assertGt(big, 0);
    }

    /// Three empty spacing-1 keys beside the pinned real pool. The first walk completes, the next two run out of gas
    /// and leave the caller about 3/64 of what they were given each time, so under Robinhood Chain's 32M limit there
    /// is not enough left for the real swap: the pinned pair cannot be traded through the adapter, in either
    /// direction, until the keeper or the timelock removes the keys. Nothing is lost; quotes still answer.
    /// After the fix (SIM_GAS): each walk stops at SIM_GAS and the pair trades under 32M in both directions.
    function test_gas_threeEmptyKeys_pinnedPairTradesUnderTheTxLimit() public {
        uint256 amt = 1 ether;
        (, uint256 fair) = _quoteGas(address(weth), address(tok), amt);
        for (uint24 i; i < 3; ++i) {
            vm.prank(outsider);
            IPM(PM).initialize(_junk(101 + i, 1), MID); // anyone can create the pools
            vm.prank(keeper);
            v3.register(_junk(101 + i, 1)); // the keeper lists them (on mainnet: after its off-chain filter)
        }
        (uint256 gBuy,) = _quoteGas(address(weth), address(tok), amt);
        (uint256 gSell,) = _quoteGas(address(tok), address(weth), amt);
        console2.log("quote gas with unlimited gas, ETH->TOK / TOK->ETH:", gBuy, gSell);
        // After the fix: at b0fd23b both were over 32M and the swaps below failed. Now each walk stops at SIM_GAS.
        assertLt(gBuy, 3 * v3.SIM_GAS() + 1_000_000);
        assertLt(gSell, 3 * v3.SIM_GAS() + 1_000_000);

        uint256 snap = vm.snapshotState();
        (bool ok, uint256 got) = _swapAsRouter(amt, TX_GAS_CAP);
        console2.log("buy with the chain's 32M limit: completed / TOK out:", ok, got);
        assertTrue(ok, "the buy completes under 32M");
        assertEq(got, fair, "at the real pool's price");
        // and the sell
        tok.mint(address(v3), amt);
        vm.cool(PM);
        vm.prank(router);
        (ok,) = address(v3).call{gas: TX_GAS_CAP}(
            abi.encodeCall(v3.swap, (address(tok), address(weth), amt, 0, address(this)))
        );
        console2.log("sell with the chain's 32M limit: completed:", ok);
        assertTrue(ok, "the sell completes under 32M");
        vm.revertToState(snap);

        // only the keeper or the timelock can clear it
        vm.prank(outsider);
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v3.unregister(_junk(101, 1));
        vm.startPrank(keeper);
        for (uint24 i; i < 3; ++i) {
            v3.unregister(_junk(101 + i, 1));
        }
        vm.stopPrank();
        (uint256 gAfter, uint256 again) = _quoteGas(address(weth), address(tok), amt);
        assertEq(again, fair);
        console2.log("quote gas after the keeper removes the three keys:", gAfter);
        // After the fix: a swap needs SIM_GAS of headroom (LowGas), so 1M is no longer enough
        (ok, got) = _swapAsRouter(amt, 3_000_000);
        assertTrue(ok);
        assertEq(got, fair);
    }

    /// The pool a call uses depends on the gas it was given. Here the real pool is listed AFTER two empty keys (it is
    /// not the first key of its pair): with plenty of gas the quote is the real pool's, under the 32M limit the real
    /// pool's simulation is starved: the quote is 0 or the call runs out of gas.
    /// After the fix (SIM_GAS, LowGas): both calls give the real pool's quote.
    function test_gas_poolChoiceDoesNotDependOnGasSupplied() public {
        MockToken tok2 = new MockToken("TOK2", 18);
        PoolKey memory real2 = PoolKey(address(0), address(tok2), 3000, 60, address(0));
        PoolKey memory j1 = PoolKey(address(0), address(tok2), 101, 1, address(0));
        PoolKey memory j2 = PoolKey(address(0), address(tok2), 102, 1, address(0));
        IPM(PM).initialize(real2, MID);
        IPM(PM).initialize(j1, HIGHEST); // a buy walks the whole range, twice the mid-price cost: always out of gas
        IPM(PM).initialize(j2, HIGHEST);
        tok2.mint(address(lp), 1e24);
        lp.modify(real2, -887220, 887220, 1000e18);
        vm.startPrank(keeper);
        v3.register(j1);
        v3.register(j2);
        v3.register(real2);
        vm.stopPrank();

        vm.cool(PM);
        uint256 plenty = v3.quote{gas: 200_000_000}(address(weth), address(tok2), 1 ether);
        vm.cool(PM);
        uint256 capped;
        bool ranOut;
        try v3.quote{gas: TX_GAS_CAP}(address(weth), address(tok2), 1 ether) returns (uint256 o) {
            capped = o;
        } catch {
            ranOut = true; // the whole call ran out of gas
        }
        console2.log("same quote with 200M gas:", plenty);
        console2.log("same quote with 32M gas: out / ran out of gas:", capped, ranOut);
        assertGt(plenty, 0);
        // After the fix: at b0fd23b the 32M call ran out of gas (capped == 0). Now it gives the same answer.
        assertFalse(ranOut);
        assertEq(capped, plenty, "the pool chosen does not depend on the gas sent");
    }

    /// One spacing-1 key at mid price: the swap still pays the real pool's price, but only if the caller sends
    /// enough gas for the walk as well.
    function test_gas_oneMidKey_swapByGasLimit() public {
        uint256 amt = 1 ether;
        (, uint256 fair) = _quoteGas(address(weth), address(tok), amt);
        PoolKey memory k = _junk(101, 1);
        vm.prank(outsider);
        IPM(PM).initialize(k, MID);
        vm.prank(keeper);
        v3.register(k);
        uint256[6] memory limits = [uint256(1_000_000), 4_000_000, 8_000_000, 16_000_000, 24_000_000, TX_GAS_CAP];
        for (uint256 i; i < limits.length; ++i) {
            uint256 snap = vm.snapshotState();
            uint256 g = gasleft();
            (bool ok, uint256 got) = _swapAsRouter(amt, limits[i]);
            g -= gasleft();
            console2.log("gas limit / swap completed / gas burnt:", limits[i], ok, g);
            if (ok) assertEq(got, fair, "a completed swap always pays the real pool's price");
            // After the fix: from 4M up the swap completes and burns at most about one SIM_GAS for the junk key
            if (limits[i] >= 4_000_000) {
                assertTrue(ok);
                assertLt(g, v3.SIM_GAS() + 1_000_000);
            }
            vm.revertToState(snap);
        }
    }
}
