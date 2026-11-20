// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/Test.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {CLTickSpacingAdapter, ICLTickSpacingFactory} from "../src/adapters/CLTickSpacingAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {VenuesRobinhood} from "../script/VenuesRobinhood.sol";
import {VenuePackageRobinhood} from "../script/VenuePackageRobinhood.sol";

interface ISafe {
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function nonce() external view returns (uint256);
    function approveHash(bytes32 hash) external;
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 nonce_
    ) external view returns (bytes32);
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        bytes calldata signatures
    ) external payable returns (bool);
}

interface IMultiSend {
    function multiSend(bytes calldata transactions) external payable;
}

/// @notice Adds Aero Slipstream and Ramses V3 to the LIVE Robinhood Chain router the way production will: two new
///         CLTickSpacingAdapters, then the real 2-of-3 Safe schedules, executes and executes again through the real
///         48h timelock (signer 1 approveHash, signer 2 execTransaction, as /admin does). Then live swaps.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodVenues -vv
contract ForkRobinhoodVenuesTest is RouterHelper, VenuesRobinhood, VenuePackageRobinhood {
    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    TimelockController tl = TimelockController(payable(LIVE_TIMELOCK));
    ISafe safe = ISafe(LIVE_SAFE);
    CLTickSpacingAdapter aero;
    CLTickSpacingAdapter ramses;
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        aero = new CLTickSpacingAdapter(ICLTickSpacingFactory(AERO_CL_FACTORY), LIVE_ROUTER, aeroSpacings());
        ramses = new CLTickSpacingAdapter(ICLTickSpacingFactory(RAMSES_CL_FACTORY), LIVE_ROUTER, ramsesSpacings());
        vm.deal(alice, 100 ether);
    }

    function _adapters() internal view returns (address[] memory a) {
        a = new address[](2);
        a[0] = address(aero);
        a[1] = address(ramses);
    }

    function test_fork_newAdaptersQuoteLivePools() public {
        if (!on) return vm.skip(true);
        uint256[3] memory sizes = [uint256(0.1 ether), 5 ether, 50 ether];
        for (uint256 i; i < 3; ++i) {
            uint256 qa = aero.quote(WETH, USDG, sizes[i]);
            uint256 qr = ramses.quote(WETH, USDG, sizes[i]);
            uint256 now_ = router.quote(address(0), USDG, sizes[i]).amountOut;
            console2.log("WETH in (wei):", sizes[i]);
            console2.log("  aero USDG:", qa, " ramses USDG:", qr);
            console2.log("  live router today (Uniswap):", now_);
            assertGt(qa, 0, "aero quotes WETH/USDG");
            assertGt(qr, 0, "ramses quotes WETH/USDG");
        }
        assertGt(aero.quote(USDG, WETH, 1000e6), 0, "aero quotes USDG -> WETH");
        assertGt(ramses.quote(USDG, WETH, 1000e6), 0, "ramses quotes USDG -> WETH");
    }

    function test_fork_safeAddsVenuesThroughTimelock() public {
        if (!on) return vm.skip(true);
        assertTrue(router.setupLocked(), "live router is locked");
        assertEq(router.owner(), LIVE_TIMELOCK, "timelock owns the router");
        uint256 before = router.adapterCount();
        uint256 minDelay = tl.getMinDelay();
        assertEq(minDelay, 48 hours);
        uint256 rDelay = router.delay();

        (Op memory a, Op memory b) = _ops(LIVE_ROUTER, _adapters());

        // round 1: one Safe transaction schedules both operations (MultiSendCallOnly)
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(
            TimelockController.scheduleBatch, (a.targets, a.values, a.payloads, a.predecessor, a.salt, minDelay)
        );
        calls[1] = abi.encodeCall(
            TimelockController.scheduleBatch,
            (b.targets, b.values, b.payloads, b.predecessor, b.salt, minDelay + rDelay + MARGIN)
        );
        _safeExec(MULTISEND_CALL_ONLY, abi.encodeCall(IMultiSend.multiSend, (_pack(LIVE_TIMELOCK, calls))), 1);
        assertEq(tl.hashOperationBatch(a.targets, a.values, a.payloads, a.predecessor, a.salt), _id(a), "id A matches");
        assertTrue(tl.isOperationPending(_id(a)) && tl.isOperationPending(_id(b)), "both scheduled");

        // nothing can run early
        vm.warp(block.timestamp + minDelay - 1);
        vm.prank(LIVE_SAFE);
        vm.expectRevert();
        tl.executeBatch(a.targets, a.values, a.payloads, a.predecessor, a.salt);

        // round 2 (48h later): propose both adapters on the router
        vm.warp(block.timestamp + 1);
        _safeExec(
            LIVE_TIMELOCK,
            abi.encodeCall(TimelockController.executeBatch, (a.targets, a.values, a.payloads, a.predecessor, a.salt)),
            0
        );
        assertGt(router.pending(router.proposalId(false, address(aero))), 0, "aero proposed");

        // round 3 (another 1 day + 1h): execute on the router
        vm.warp(block.timestamp + rDelay + MARGIN);
        _safeExec(
            LIVE_TIMELOCK,
            abi.encodeCall(TimelockController.executeBatch, (b.targets, b.values, b.payloads, b.predecessor, b.salt)),
            0
        );
        assertTrue(router.isAdapter(address(aero)) && router.isAdapter(address(ramses)), "both adapters live");
        assertEq(router.adapterCount(), before + 2);
        assertTrue(tl.isOperationDone(_id(b)));

        // live swaps through the router now see Aero and Ramses
        _swapRoundTrip(5 ether);
        _swapRoundTrip(0.05 ether);
    }

    function test_fork_executeBeforeRouterDelayReverts() public {
        if (!on) return vm.skip(true);
        (Op memory a, Op memory b) = _ops(LIVE_ROUTER, _adapters());
        uint256 minDelay = tl.getMinDelay();
        vm.startPrank(LIVE_SAFE);
        tl.scheduleBatch(a.targets, a.values, a.payloads, a.predecessor, a.salt, minDelay);
        tl.scheduleBatch(b.targets, b.values, b.payloads, b.predecessor, b.salt, minDelay);
        vm.warp(block.timestamp + minDelay);
        // B has A as predecessor: it cannot run first
        vm.expectRevert();
        tl.executeBatch(b.targets, b.values, b.payloads, b.predecessor, b.salt);
        tl.executeBatch(a.targets, a.values, a.payloads, a.predecessor, a.salt);
        // the router's own 1-day delay still applies, whatever the timelock says
        vm.expectRevert();
        tl.executeBatch(b.targets, b.values, b.payloads, b.predecessor, b.salt);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- helpers

    function _swapRoundTrip(uint256 amt) internal {
        uint256 g = gasleft();
        StoaRouter.Quote memory q = router.quote(address(0), USDG, amt);
        console2.log("ETH in (wei):", amt);
        console2.log("  quote gas:", g - gasleft());
        console2.log("  USDG out:", q.amountOut);
        console2.log("  leg1 venue:", q.leg1.venue, q.mid == address(0) ? "direct" : "via mid");
        g = gasleft();
        uint256 out = _swapAs(router, alice, address(0), USDG, amt, q.amountOut, alice, address(0));
        console2.log("  quote + swap gas:", g - gasleft());
        assertEq(out, q.amountOut, "fill equals quote");
        vm.prank(alice);
        IERC20(USDG).approve(address(router), out);
        uint256 e0 = alice.balance;
        uint256 back = _swapAs(router, alice, USDG, address(0), out, 0, alice, address(0));
        assertEq(alice.balance - e0, back);
        console2.log("  round trip back (wei):", back);
        assertGt(back, amt * 99 / 100, "round trip loses < 1%");
        assertEq(
            IERC20(USDG).balanceOf(address(aero)) + IERC20(USDG).balanceOf(address(ramses)), 0, "adapters keep nothing"
        );
        assertEq(
            IERC20(WETH).balanceOf(address(aero)) + IERC20(WETH).balanceOf(address(ramses)), 0, "adapters keep nothing"
        );
    }

    /// signer 1 approves the hash on-chain, signer 2 executes with both "pre-approved" signatures (v = 1)
    function _safeExec(address to, bytes memory data, uint8 operation) internal {
        address[] memory owners = safe.getOwners();
        assertEq(safe.getThreshold(), 2);
        bytes32 h = safe.getTransactionHash(to, 0, data, operation, 0, 0, 0, address(0), address(0), safe.nonce());
        (address s1, address s2) = (owners[0], owners[2]); // owner wallet and treasury
        vm.prank(s1);
        safe.approveHash(h);
        (address lo, address hi) = s1 < s2 ? (s1, s2) : (s2, s1);
        bytes memory sigs = abi.encodePacked(
            bytes32(uint256(uint160(lo))), bytes32(0), uint8(1), bytes32(uint256(uint160(hi))), bytes32(0), uint8(1)
        );
        vm.prank(s2);
        assertTrue(safe.execTransaction(to, 0, data, operation, 0, 0, 0, address(0), payable(address(0)), sigs));
    }

    function _pack(address to, bytes[] memory calls) internal pure returns (bytes memory p) {
        for (uint256 i; i < calls.length; ++i) {
            p = abi.encodePacked(p, uint8(0), to, uint256(0), calls[i].length, calls[i]);
        }
    }
}
