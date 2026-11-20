// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/Test.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {SafeTestHelper} from "./utils/SafeTestHelper.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaBuyback} from "../src/StoaBuyback.sol";
import {BondRegistry} from "../src/BondRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {VenuesRobinhood} from "../script/VenuesRobinhood.sol";
import {TokenPackageRobinhood} from "../script/TokenPackageRobinhood.sol";

/// @notice $STOA utility against the LIVE Robinhood Chain deployment:
///         - the real Safe hands the real FeeDistributor to StoaBuyback through the real 48h timelock
///         - real protocol fees are swapped through the live router and burned (MRDN stands in for $STOA, which still
///           trades on its Pons bonding curve: MRDN is a graduated Pons token, the exact route $STOA will take)
///         - real $STOA is bonded, unbonded and slashed in BondRegistry
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodToken -vv
contract ForkRobinhoodTokenTest is RouterHelper, SafeTestHelper, VenuesRobinhood, TokenPackageRobinhood {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    address constant MRDN = 0x6437614eA1efBa0eB4b43bC1aF53808722B1Cf13;
    address constant STOA_HOLDER = 0xF1F305d5a803CF0EaC6994F3877Ff63B5a6bdb4a;

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    FeeDistributor fees = FeeDistributor(LIVE_FEES);
    TimelockController tl = TimelockController(payable(LIVE_TIMELOCK));
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        vm.deal(alice, 10 ether);
    }

    /// some protocol fees in USDG and WETH, from real swaps through the live router
    function _makeFees() internal {
        uint256 got = _swapAs(router, alice, address(0), USDG, 1 ether, 0, alice, address(0));
        vm.prank(alice);
        IERC20(USDG).approve(address(router), got);
        _swapAs(router, alice, USDG, address(0), got / 2, 0, alice, address(0));
    }

    function test_fork_safeHandsFeesToBuybackThroughTimelock() public {
        if (!on) return vm.skip(true);
        if (fees.owner() != LIVE_TIMELOCK) {
            console2.log("the live handover already ran: FeeDistributor owner", fees.owner());
            return vm.skip(true);
        }
        StoaBuyback bb = new StoaBuyback(LIVE_TIMELOCK, fees, router, IERC20(STOA), KEEPER);
        Op memory o = _handoverOp(address(bb));
        uint256 d = tl.getMinDelay();
        _safeExec(
            LIVE_SAFE,
            LIVE_TIMELOCK,
            abi.encodeCall(
                TimelockController.scheduleBatch, (o.targets, o.values, o.payloads, o.predecessor, o.salt, d)
            ),
            0
        );
        assertEq(tl.hashOperationBatch(o.targets, o.values, o.payloads, o.predecessor, o.salt), _id(o));
        vm.warp(block.timestamp + d);
        _safeExec(
            LIVE_SAFE,
            LIVE_TIMELOCK,
            abi.encodeCall(TimelockController.executeBatch, (o.targets, o.values, o.payloads, o.predecessor, o.salt)),
            0
        );
        assertEq(fees.owner(), address(bb), "buyback owns the FeeDistributor");

        // the timelock can no longer withdraw fees; it still changes other settings through the buyback contract
        vm.prank(LIVE_TIMELOCK);
        vm.expectRevert();
        fees.withdrawProtocol(USDG, 1, LIVE_TIMELOCK);
        vm.prank(LIVE_TIMELOCK);
        bb.exec(abi.encodeCall(FeeDistributor.setReferralBps, (1_000)));

        // $STOA trades in its Uniswap V4 pool since graduation: the keeper buys it with the fees and burns it
        _makeFees();
        uint256 acc = fees.protocolAccrued(USDG);
        assertGt(acc, 0);
        StoaRouter.Quote memory q = router.quote(USDG, STOA, acc);
        assertGt(q.amountOut, 0, "route to $STOA");
        uint256 b0 = IERC20(STOA).balanceOf(BURN);
        vm.prank(KEEPER);
        uint256 got = bb.buyback(USDG, acc, q.mid, q.leg1, q.leg2, q.amountOut * 99 / 100);
        assertEq(IERC20(STOA).balanceOf(BURN) - b0, got, "bought $STOA reaches the burn address");
        assertEq(fees.protocolAccrued(USDG), 0);
    }

    function test_fork_buybackSwapsLiveFeesAndBurns() public {
        if (!on) return vm.skip(true);
        // MRDN in place of $STOA: a graduated Pons token in a Uniswap V4 pool with the Pons hook
        StoaBuyback bb = new StoaBuyback(LIVE_TIMELOCK, fees, router, IERC20(MRDN), KEEPER);
        vm.startPrank(LIVE_TIMELOCK);
        fees.transferOwnership(address(bb));
        bb.acceptFeeOwnership();
        vm.stopPrank();
        _makeFees();

        address[2] memory toks = [USDG, WETH];
        uint256 burned;
        for (uint256 i; i < 2; ++i) {
            uint256 acc = fees.protocolAccrued(toks[i]);
            StoaRouter.Quote memory q = router.quote(toks[i], MRDN, acc);
            assertGt(q.amountOut, 0, "route to the stand-in token");
            uint256 b0 = IERC20(MRDN).balanceOf(BURN);
            vm.prank(KEEPER);
            uint256 got = bb.buyback(toks[i], acc, q.mid, q.leg1, q.leg2, q.amountOut * 99 / 100);
            assertEq(IERC20(MRDN).balanceOf(BURN) - b0, got, "bought tokens reach the burn address");
            assertEq(fees.protocolAccrued(toks[i]), 0);
            burned += got;
            console2.log("fees in", toks[i], acc);
            console2.log("  burned", got);
        }
        assertEq(bb.totalBurned(), burned);
        assertEq(IERC20(MRDN).balanceOf(address(bb)), 0);
        assertEq(IERC20(USDG).balanceOf(address(bb)) + IERC20(WETH).balanceOf(address(bb)), 0, "nothing left behind");
    }

    function test_fork_realStoaBondUnbondSlash() public {
        if (!on) return vm.skip(true);
        BondRegistry reg = new BondRegistry(LIVE_TIMELOCK, IERC20(STOA), BOND_UNBOND_DELAY);
        uint256 amt = 1_000_000 ether;
        // the holder's live balance moves with trading: give it exactly what the test bonds (real token contract)
        deal(STOA, STOA_HOLDER, amt);
        vm.startPrank(STOA_HOLDER);
        IERC20(STOA).approve(address(reg), amt);
        reg.bond(amt); // refuses fee-on-transfer tokens: $STOA must arrive in full
        reg.requestUnbond(400_000 ether);
        vm.stopPrank();
        assertEq(IERC20(STOA).balanceOf(address(reg)), amt);
        assertEq(reg.totalBonded(), amt);

        uint256 burn0 = IERC20(STOA).balanceOf(BURN);
        vm.prank(LIVE_TIMELOCK);
        reg.slash(STOA_HOLDER, 100_000 ether);
        assertEq(IERC20(STOA).balanceOf(BURN) - burn0, 100_000 ether, "slashed STOA burned");

        vm.warp(block.timestamp + BOND_UNBOND_DELAY);
        uint256 h0 = IERC20(STOA).balanceOf(STOA_HOLDER);
        vm.prank(STOA_HOLDER);
        reg.withdrawUnbonded();
        assertEq(IERC20(STOA).balanceOf(STOA_HOLDER) - h0, 400_000 ether);
        assertEq(IERC20(STOA).balanceOf(address(reg)), reg.totalBonded());
    }
}
