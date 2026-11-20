// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";

/// @dev A PoolManager that reports every pool as initialized and answers quote simulations with out = in * fee / 100
///      (so a key with a higher fee field "pays" more, which lets a test tell which key the adapter picked).
contract MockQuotingPoolManager {
    error Simulated(uint256 inUsed, uint256 out);

    function extsload(bytes32) external pure returns (bytes32) {
        return bytes32(uint256(1) << 100); // a non-zero sqrt price: initialized
    }

    function unlock(bytes calldata data) external pure returns (bytes memory) {
        (, PoolKey memory key,, uint256 amountIn) = abi.decode(data, (bool, PoolKey, bool, uint256));
        if (key.fee == 999) {
            // a pool whose simulation walks the whole tick range: burns all the gas it is given
            uint256 x;
            while (true) {
                x = uint256(keccak256(abi.encode(x)));
            }
        }
        revert Simulated(amountIn, amountIn * key.fee / 100);
    }
}

/// @notice UniswapV4AdapterV3: no eviction, pinned keys, owner-kept hook allowlist, guardian off switch, gas cap.
contract UniswapV4AdapterV3Test is Test {
    MockQuotingPoolManager pm;
    UniswapV4AdapterV3 v4;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address stranger = makeAddr("stranger");
    address guardian = makeAddr("guardian");
    address tok = makeAddr("tok");
    address weth = makeAddr("weth");
    address fables = makeAddr("fablesHook");

    function setUp() public {
        pm = new MockQuotingPoolManager();
        address[] memory hooks = new address[](1); // hook-less pools only
        v4 = new UniswapV4AdapterV3(IPoolManager(address(pm)), weth, makeAddr("router"), owner, hooks, keeper, guardian);
    }

    function _key(uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey(address(0), tok, fee, 60, address(0));
    }

    function _hooked(uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey(address(0), tok, fee, 60, fables);
    }

    function _fill() internal {
        for (uint24 i; i < 6; ++i) {
            vm.prank(keeper);
            v4.register(_key(100 + i));
        }
    }

    function test_fullPairReverts_forEveryone() public {
        _fill();
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.Full.selector);
        v4.register(_key(3000));
        vm.prank(owner);
        vm.expectRevert(UniswapV4AdapterV3.Full.selector);
        v4.register(_key(3000));
        PoolKey[] memory ks = v4.keysFor(weth, tok);
        assertEq(ks.length, 6);
        for (uint256 i; i < 6; ++i) {
            assertEq(ks[i].fee, 100 + i, "nothing was replaced");
        }
    }

    function test_onlyKeeperOrOwnerRegisters() public {
        vm.prank(stranger);
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v4.register(_key(100));
        vm.prank(keeper);
        v4.register(_key(100));
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.Known.selector);
        v4.register(_key(100));
    }

    function test_pinnedKey_keeperCannotRemove_ownerCan() public {
        vm.prank(keeper);
        v4.register(_key(100));
        vm.prank(keeper);
        vm.expectRevert(); // only the owner pins
        v4.setPinned(_key(100), true);
        vm.prank(owner);
        v4.setPinned(_key(100), true);
        assertTrue(v4.pinned(v4.poolId(_key(100))));

        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.PinnedKey.selector);
        v4.unregister(_key(100));
        assertEq(v4.keysFor(weth, tok).length, 1);

        vm.prank(owner);
        v4.unregister(_key(100));
        assertEq(v4.keysFor(weth, tok).length, 0);
        assertFalse(v4.pinned(v4.poolId(_key(100))), "the pin goes with the key");
    }

    function test_pinNeedsARegisteredKey() public {
        vm.prank(owner);
        vm.expectRevert(UniswapV4AdapterV3.NotFound.selector);
        v4.setPinned(_key(100), true);
    }

    function test_keeperRemovesUnpinnedKeys() public {
        vm.prank(keeper);
        v4.register(_key(100));
        vm.prank(stranger);
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v4.unregister(_key(100));
        vm.prank(keeper);
        v4.unregister(_key(100));
        assertEq(v4.keysFor(weth, tok).length, 0);
    }

    function test_hookAllowlist_isTheOwners_andDisallowingStopsRouting() public {
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v4.register(_hooked(5000));

        vm.prank(keeper);
        vm.expectRevert(); // only the owner changes the allowlist
        v4.setHookAllowed(fables, true);

        vm.prank(owner);
        v4.setHookAllowed(fables, true);
        vm.prank(keeper);
        v4.register(_hooked(5000)); // pays 50x
        vm.prank(keeper);
        v4.register(_key(200)); // pays 2x
        assertEq(v4.quote(weth, tok, 1e18), 50e18, "the hooked pool pays more");

        vm.prank(owner);
        v4.setHookAllowed(fables, false);
        assertEq(v4.quote(weth, tok, 1e18), 2e18, "a disallowed hook is skipped at once");
    }

    function test_quotePicksTheBestKey_bothDirections() public {
        vm.startPrank(keeper);
        v4.register(_key(150));
        v4.register(_key(400));
        v4.register(_key(250));
        vm.stopPrank();
        assertEq(v4.quote(weth, tok, 100), 400);
        assertEq(v4.quote(tok, weth, 100), 400);
        assertEq(v4.quote(weth, weth, 100), 0);
        assertEq(v4.quote(weth, tok, 0), 0);
    }

    function test_swapIsRouterOnly() public {
        vm.expectRevert(UniswapV4AdapterV3.OnlyRouter.selector);
        v4.swap(weth, tok, 1, 0, address(this));
    }

    function test_keeperIsSetByTheOwnerOnly() public {
        vm.prank(keeper);
        vm.expectRevert();
        v4.setKeeper(stranger);
        vm.prank(owner);
        v4.setKeeper(address(0));
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v4.register(_key(100));
        vm.prank(owner);
        v4.register(_key(100)); // the owner still can
    }

    function test_guardianDisablesAHookAtOnce_butCannotAllowOne() public {
        vm.prank(owner);
        v4.setHookAllowed(fables, true);
        vm.startPrank(keeper);
        v4.register(_hooked(5000)); // pays 50x
        v4.register(_key(200)); // pays 2x
        vm.stopPrank();
        assertEq(v4.quote(weth, tok, 1e18), 50e18);

        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.NotGuardian.selector);
        v4.disableHook(fables);
        vm.prank(stranger);
        vm.expectRevert(UniswapV4AdapterV3.NotGuardian.selector);
        v4.disableHook(fables);

        vm.prank(guardian);
        v4.disableHook(fables);
        assertFalse(v4.hookAllowed(fables));
        assertEq(v4.quote(weth, tok, 1e18), 2e18, "the hook stops routing in the same block");
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v4.register(_hooked(6000)); // and new keys with it are refused

        vm.prank(guardian);
        vm.expectRevert(); // putting a hook on the list stays with the owner
        v4.setHookAllowed(fables, true);
        vm.prank(owner);
        v4.disableHook(address(0)); // the owner can use the switch too
        assertEq(v4.quote(weth, tok, 1e18), 0);
    }

    function test_guardianIsSetByTheOwnerOnly() public {
        assertEq(v4.guardian(), guardian);
        vm.prank(guardian);
        vm.expectRevert();
        v4.setGuardian(stranger);
        vm.prank(owner);
        v4.setGuardian(address(0));
        vm.prank(guardian);
        vm.expectRevert(UniswapV4AdapterV3.NotGuardian.selector);
        v4.disableHook(fables);
    }

    function test_gasCap_aRunawaySimulationIsSkipped() public {
        vm.startPrank(keeper);
        v4.register(_key(999)); // burns every gas unit it gets
        v4.register(_key(300));
        vm.stopPrank();
        assertEq(v4.quote(weth, tok, 100), 300, "the runaway key is skipped, the other one quotes");
    }

    function test_gasCap_aFullPairOfRunawayKeysStaysUnderTheBlockLimit() public {
        vm.startPrank(keeper);
        v4.register(_key(999));
        for (uint24 i = 1; i < 6; ++i) {
            v4.register(PoolKey(address(0), tok, 999, int24(60 + int24(i)), address(0)));
        }
        vm.stopPrank();
        uint256 g = gasleft();
        assertEq(v4.quote{gas: 32_000_000}(weth, tok, 100), 0);
        g -= gasleft();
        assertLe(g, v4.MAX_KEYS() * v4.SIM_GAS() + 500_000, "at most MAX_KEYS capped simulations");
    }

    /// The switch also holds on the swap path, pinned key included: the swap finds no route before the PoolManager is
    /// touched (Hey Research Lab's note on the off switch).
    function test_guardianOff_stopsSwapsToo_evenOnAPinnedKey() public {
        vm.prank(owner);
        v4.setHookAllowed(fables, true);
        vm.prank(keeper);
        v4.register(_hooked(5000));
        vm.prank(owner);
        v4.setPinned(_hooked(5000), true);
        vm.prank(guardian);
        v4.disableHook(fables);
        vm.prank(makeAddr("router"));
        vm.expectRevert(UniswapV4AdapterV3.NoPath.selector);
        v4.swap(weth, tok, 1e18, 0, address(this));
        vm.prank(makeAddr("router"));
        vm.expectRevert(UniswapV4AdapterV3.NoPath.selector);
        v4.swap(tok, weth, 1e18, 0, address(this));
        assertTrue(v4.pinned(v4.poolId(_hooked(5000))), "the key keeps its slot and pin");
    }

    /// A call that cannot give a simulation its full SIM_GAS reverts instead of skipping that pool.
    function test_gasCap_tooLittleGasReverts_insteadOfStarvingAPool() public {
        vm.prank(keeper);
        v4.register(_key(300));
        vm.expectRevert(UniswapV4AdapterV3.LowGas.selector);
        v4.quote{gas: 1_500_000}(weth, tok, 100);
        assertEq(v4.quote{gas: 2_500_000}(weth, tok, 100), 300);
    }
}
