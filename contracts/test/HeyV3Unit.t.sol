// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3} from "../src/adapters/UniswapV4AdapterV3.sol";

/// @dev Same mock as Stoa's own V3 test: every pool reads as initialized, a simulation answers out = in * fee / 100.
contract HeyMockPoolManager {
    error Simulated(uint256 inUsed, uint256 out);

    function extsload(bytes32) external pure returns (bytes32) {
        return bytes32(uint256(1) << 100);
    }

    function unlock(bytes calldata data) external pure returns (bytes memory) {
        (, PoolKey memory key,, uint256 amountIn) = abi.decode(data, (bool, PoolKey, bool, uint256));
        revert Simulated(amountIn, amountIn * key.fee / 100);
    }
}

/// @dev Added to Stoa's repo from HEY Research Lab's review (17 Nov 2026). Stoa's changes: the constructor's new guardian
///      argument.
/// @notice HEY Research Lab pre-deploy review of UniswapV4AdapterV3 (commit b0fd23b): registry, pin and allowlist cases
///         that Stoa's own nine tests do not cover. Local only (mock PoolManager).
contract HeyV3UnitTest is Test {
    HeyMockPoolManager pm;
    UniswapV4AdapterV3 v4;
    address owner = makeAddr("timelock");
    address keeper = makeAddr("keeper");
    address router = makeAddr("router");
    address outsider = makeAddr("outsider");
    address weth = address(0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73);
    address tokHi = address(0xF000000000000000000000000000000000000001); // sorts above WETH
    address tokLo = address(0x0000000000000000000000000000000000001001); // sorts below WETH
    address hook = makeAddr("allowlistedHook");

    function setUp() public {
        pm = new HeyMockPoolManager();
        address[] memory hooks = new address[](2);
        hooks[1] = hook; // hooks[0] = address(0): hook-less pools
        v4 = new UniswapV4AdapterV3(IPoolManager(address(pm)), weth, router, owner, hooks, keeper, makeAddr("guardian"));
    }

    function _native(uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey(address(0), tokHi, fee, 60, address(0));
    }

    function _wrapped(uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey(weth, tokHi, fee, 60, address(0));
    }

    function _hooked(uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey(address(0), tokHi, fee, 60, hook);
    }

    // ------------------------------------------------------------------ who can change the registry

    function test_outsiderCanChangeNothing() public {
        vm.prank(keeper);
        v4.register(_native(100));
        vm.startPrank(outsider);
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v4.register(_native(200));
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v4.unregister(_native(100));
        vm.expectRevert();
        v4.setPinned(_native(100), true);
        vm.expectRevert();
        v4.setHookAllowed(outsider, true);
        vm.expectRevert();
        v4.setKeeper(outsider);
        vm.expectRevert();
        v4.transferOwnership(outsider);
        vm.expectRevert();
        v4.acceptOwnership();
        vm.expectRevert();
        v4.renounceOwnership();
        vm.expectRevert(UniswapV4AdapterV3.OnlyRouter.selector);
        v4.swap(weth, tokHi, 1, 0, outsider);
        vm.expectRevert(UniswapV4AdapterV3.OnlyPoolManager.selector);
        v4.unlockCallback("");
        vm.stopPrank();
        assertEq(v4.keysFor(weth, tokHi).length, 1);
    }

    function test_keeperCannotPinUnpinOrTouchTheAllowlist() public {
        vm.prank(keeper);
        v4.register(_native(100));
        vm.prank(owner);
        v4.setPinned(_native(100), true);
        vm.startPrank(keeper);
        vm.expectRevert();
        v4.setPinned(_native(100), false); // cannot unpin and then remove
        vm.expectRevert();
        v4.setHookAllowed(hook, false);
        vm.expectRevert();
        v4.setHookAllowed(makeAddr("newHook"), true);
        vm.expectRevert();
        v4.setKeeper(keeper);
        vm.expectRevert(UniswapV4AdapterV3.PinnedKey.selector);
        v4.unregister(_native(100));
        vm.stopPrank();
        assertTrue(v4.pinned(v4.poolId(_native(100))));
    }

    // ------------------------------------------------------------------ slot filling (no eviction)

    /// Six junk keys registered first keep the real pool out, for the keeper and the owner alike. It is not permanent:
    /// the keeper (or the owner) removes one unpinned junk key and the real pool goes in.
    function test_slotFilling_blocksTheRealPool_untilTheKeeperRemovesJunk() public {
        vm.startPrank(keeper);
        for (uint24 i; i < 6; ++i) {
            v4.register(_native(10 + i)); // junk: pays 0.10x .. 0.15x
        }
        PoolKey memory real_ = _native(5000); // the real pool pays 50x
        vm.expectRevert(UniswapV4AdapterV3.Full.selector);
        v4.register(real_);
        vm.stopPrank();
        vm.prank(owner);
        vm.expectRevert(UniswapV4AdapterV3.Full.selector);
        v4.register(real_);
        // the pair now routes through junk only
        assertEq(v4.quote(weth, tokHi, 1e18), 0.15e18, "best junk key");

        // nobody else can free a slot
        vm.prank(outsider);
        vm.expectRevert(UniswapV4AdapterV3.NotKeeper.selector);
        v4.unregister(_native(10));

        // recovery: one keeper transaction each
        vm.startPrank(keeper);
        v4.unregister(_native(10));
        v4.register(real_);
        vm.stopPrank();
        assertEq(v4.quote(weth, tokHi, 1e18), 50e18, "the real pool is used once it is in");
    }

    /// Native-ETH keys and WETH keys of one token share the same six slots.
    function test_slotFilling_nativeAndWethKeysShareTheSixSlots() public {
        vm.startPrank(keeper);
        for (uint24 i; i < 6; ++i) {
            v4.register(_native(10 + i));
        }
        vm.expectRevert(UniswapV4AdapterV3.Full.selector);
        v4.register(_wrapped(5000));
        vm.stopPrank();
        assertEq(v4.keysFor(weth, tokHi).length, 6);
    }

    /// Junk in the five free slots cannot lower what a pinned real pool pays: the best full fill wins.
    function test_junkBesideAPinnedPool_cannotLowerTheQuote() public {
        vm.prank(keeper);
        v4.register(_native(5000));
        vm.prank(owner);
        v4.setPinned(_native(5000), true);
        vm.startPrank(keeper);
        for (uint24 i; i < 5; ++i) {
            v4.register(_native(10 + i));
        }
        vm.expectRevert(UniswapV4AdapterV3.Full.selector);
        v4.register(_native(99));
        vm.stopPrank();
        assertEq(v4.quote(weth, tokHi, 1e18), 50e18);
        assertEq(v4.quote(tokHi, weth, 1e18), 50e18);
    }

    // ------------------------------------------------------------------ keeper removals around a pinned key

    /// The keeper removes every unpinned key around a pinned one (swap-and-pop moves it between indexes); the pinned
    /// key stays registered, pinned and routed.
    function test_keeperRemovals_neverDropOrUnpinAPinnedKey() public {
        vm.startPrank(keeper);
        v4.register(_native(5000)); // index 0, to be pinned
        for (uint24 i; i < 5; ++i) {
            v4.register(_native(10 + i));
        }
        vm.stopPrank();
        bytes32 id = v4.poolId(_native(5000));
        vm.prank(owner);
        v4.setPinned(_native(5000), true);

        vm.startPrank(keeper);
        for (uint24 i; i < 5; ++i) {
            v4.unregister(_native(10 + i));
            assertTrue(v4.pinned(id));
            vm.expectRevert(UniswapV4AdapterV3.PinnedKey.selector);
            v4.unregister(_native(5000));
        }
        vm.stopPrank();
        PoolKey[] memory ks = v4.keysFor(weth, tokHi);
        assertEq(ks.length, 1);
        assertEq(ks[0].fee, 5000);
        assertEq(v4.quote(weth, tokHi, 1e18), 50e18);
    }

    /// A pinned key in the last slot, and the middle: removing others never swaps the pin onto another key.
    function test_pinIsByPoolId_notBySlot() public {
        vm.startPrank(keeper);
        v4.register(_native(11));
        v4.register(_native(12));
        v4.register(_native(5000)); // last slot
        vm.stopPrank();
        vm.prank(owner);
        v4.setPinned(_native(5000), true);
        vm.prank(keeper);
        v4.unregister(_native(11)); // the pinned key moves from slot 2 to slot 0
        assertTrue(v4.pinned(v4.poolId(_native(5000))));
        assertFalse(v4.pinned(v4.poolId(_native(12))));
        vm.prank(keeper);
        v4.unregister(_native(12)); // unpinned neighbour is still removable
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.PinnedKey.selector);
        v4.unregister(_native(5000));
    }

    /// The pin ends with the key: after the owner removes a pinned key, a re-registered copy is not pinned.
    function test_pinDoesNotOutliveTheKey() public {
        vm.prank(keeper);
        v4.register(_native(5000));
        vm.startPrank(owner);
        v4.setPinned(_native(5000), true);
        v4.unregister(_native(5000));
        vm.stopPrank();
        assertFalse(v4.pinned(v4.poolId(_native(5000))));
        vm.startPrank(keeper);
        v4.register(_native(5000));
        v4.unregister(_native(5000)); // not pinned any more
        vm.stopPrank();
        // and a pin cannot be set ahead of registration, so no pin can wait for a key
        vm.prank(owner);
        vm.expectRevert(UniswapV4AdapterV3.NotFound.selector);
        v4.setPinned(_native(5000), true);
    }

    /// Design note: a pin is set by the timelock on a key that must already be registered. If the keeper removes the
    /// key before the timelock call lands, the timelock call reverts (and with it any batch it is part of).
    function test_keeperCanMakeAQueuedPinRevert() public {
        vm.prank(keeper);
        v4.register(_native(5000));
        // ... timelock schedules setPinned(key, true); 48 hours pass ...
        vm.prank(keeper);
        v4.unregister(_native(5000));
        vm.prank(owner);
        vm.expectRevert(UniswapV4AdapterV3.NotFound.selector);
        v4.setPinned(_native(5000), true);
    }

    // ------------------------------------------------------------------ hook allowlist on the swap path

    /// A disallowed hook is refused by quote AND by swap (NoPath before the PoolManager is touched), also when the
    /// key is pinned. Allowing the hook again brings the key straight back.
    function test_disallowedHook_isSkippedBySwapToo_evenWhenPinned() public {
        vm.prank(keeper);
        v4.register(_hooked(5000));
        vm.prank(owner);
        v4.setPinned(_hooked(5000), true);
        assertEq(v4.quote(weth, tokHi, 1e18), 50e18);

        vm.prank(owner);
        v4.setHookAllowed(hook, false);
        assertEq(v4.quote(weth, tokHi, 1e18), 0);
        assertEq(v4.quote(tokHi, weth, 1e18), 0);
        vm.prank(router);
        vm.expectRevert(UniswapV4AdapterV3.NoPath.selector);
        v4.swap(weth, tokHi, 1e18, 0, router);
        vm.prank(router);
        vm.expectRevert(UniswapV4AdapterV3.NoPath.selector);
        v4.swap(tokHi, weth, 1e18, 0, router);

        // the key keeps its slot and its pin; new keys with that hook are refused
        assertEq(v4.keysFor(weth, tokHi).length, 1);
        assertTrue(v4.pinned(v4.poolId(_hooked(5000))));
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v4.register(_hooked(6000));

        vm.prank(owner);
        v4.setHookAllowed(hook, true);
        assertEq(v4.quote(weth, tokHi, 1e18), 50e18);
    }

    /// With a disallowed-hook key and a hook-less key on one pair, swap picks only among allowed keys.
    function test_disallowedHook_fallsBackToAllowedKeys() public {
        vm.startPrank(keeper);
        v4.register(_hooked(5000));
        v4.register(_native(200));
        vm.stopPrank();
        vm.prank(owner);
        v4.setHookAllowed(hook, false);
        assertEq(v4.quote(weth, tokHi, 1e18), 2e18);
        // the keeper can clear the dead key at once (it is not pinned)
        vm.prank(keeper);
        v4.unregister(_hooked(5000));
        assertEq(v4.keysFor(weth, tokHi).length, 1);
    }

    /// Turning off address(0) stops every hook-less pool: the list entry for "no hook" is a real switch.
    function test_hooklessPoolsFollowTheAllowlistEntryForZero() public {
        vm.prank(keeper);
        v4.register(_native(200));
        vm.prank(owner);
        v4.setHookAllowed(address(0), false);
        assertEq(v4.quote(weth, tokHi, 1e18), 0);
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.HookNotAllowed.selector);
        v4.register(_native(300));
    }

    // ------------------------------------------------------------------ key shape

    function test_badKeysAreRefused() public {
        vm.startPrank(keeper);
        vm.expectRevert(UniswapV4AdapterV3.BadKey.selector);
        v4.register(PoolKey(tokHi, weth, 100, 60, address(0))); // unsorted
        vm.expectRevert(UniswapV4AdapterV3.BadKey.selector);
        v4.register(PoolKey(address(0), weth, 100, 60, address(0))); // ETH/WETH is one token to the adapter
        vm.expectRevert(UniswapV4AdapterV3.BadKey.selector);
        v4.register(PoolKey(tokLo, tokLo, 100, 60, address(0)));
        v4.register(PoolKey(tokLo, weth, 300, 60, address(0))); // token below WETH: fine
        vm.stopPrank();
        assertEq(v4.quote(tokLo, weth, 100), 300);
        assertEq(v4.quote(weth, tokLo, 100), 300);
    }

    function testFuzz_registryNeverExceedsSix_andPinnedKeySurvivesTheKeeper(uint256 seed) public {
        vm.prank(keeper);
        v4.register(_native(5000));
        vm.prank(owner);
        v4.setPinned(_native(5000), true);
        for (uint256 n; n < 40; ++n) {
            seed = uint256(keccak256(abi.encode(seed)));
            uint24 fee = uint24(1 + seed % 12);
            bool add = (seed >> 8) % 2 == 0;
            vm.prank(keeper);
            if (add) {
                try v4.register(_native(fee)) {} catch {}
            } else {
                try v4.unregister((seed >> 16) % 5 == 0 ? _native(5000) : _native(fee)) {} catch {}
            }
            PoolKey[] memory ks = v4.keysFor(weth, tokHi);
            assertLe(ks.length, 6);
            bool has;
            for (uint256 i; i < ks.length; ++i) {
                if (ks[i].fee == 5000) has = true;
                for (uint256 j = i + 1; j < ks.length; ++j) {
                    assertTrue(ks[i].fee != ks[j].fee, "no duplicate key");
                }
            }
            assertTrue(has, "the pinned key is always registered");
            assertEq(v4.quote(weth, tokHi, 1e18), 50e18, "and always the route");
        }
    }
}
