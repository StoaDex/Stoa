// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {StoaCrossBuy} from "../src/tools/StoaCrossBuy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice StoaCrossBuy against the live Robinhood Chain router: delivered ETH becomes the buyer's token, a failed swap
///         refunds the ETH to the buyer, nothing stays in the contract.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodCrossBuy -vv
contract ForkRobinhoodCrossBuy is Test {
    address constant LIVE_ROUTER = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5;
    address constant STOA = 0x13E6993417616De724F2b337D65063f229e96718;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    StoaCrossBuy cb;
    address buyer = makeAddr("buyer");
    address relayer = makeAddr("relayer");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        cb = new StoaCrossBuy(router);
        vm.deal(relayer, 10 ether);
    }

    function _route(address tokenOut, uint256 amt) internal returns (StoaRouter.Quote memory q) {
        q = router.quote(address(0), tokenOut, amt);
        assertGt(q.amountOut, 0, "no route");
    }

    function _buy(address tokenOut, uint256 amt, uint256 minOut) internal returns (uint256) {
        StoaRouter.Quote memory q = _route(tokenOut, amt);
        vm.prank(relayer);
        return cb.buy{value: amt}(tokenOut, q.mid, q.leg1, q.leg2, minOut, buyer, block.timestamp + 600, address(0));
    }

    function test_buysStoaForTheBuyer() public {
        if (!on) return;
        uint256 amt = 0.01 ether;
        StoaRouter.Quote memory q = _route(STOA, amt);
        uint256 b0 = IERC20(STOA).balanceOf(buyer);
        uint256 out = _buy(STOA, amt, (q.amountOut * 99) / 100);
        assertEq(IERC20(STOA).balanceOf(buyer) - b0, out, "buyer got the output");
        assertGe(out, (q.amountOut * 99) / 100, "at least minOut");
        assertEq(address(cb).balance, 0, "no ETH left");
        assertEq(IERC20(STOA).balanceOf(address(cb)), 0, "no token left");
        console2.log("0.01 ETH ->", out / 1e18, "STOA");
    }

    function test_buysUsdgForTheBuyer() public {
        if (!on) return;
        uint256 out = _buy(USDG, 0.01 ether, 1);
        assertEq(IERC20(USDG).balanceOf(buyer), out);
        assertEq(address(cb).balance, 0);
    }

    /// a token still on its Pons launch curve (not graduated): the router quotes it, so the buy works the same way
    function test_buysPonsCurveToken() public {
        if (!on) return;
        address pons = vm.envOr("PONS_TOKEN", address(0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3));
        StoaRouter.Quote memory q = _route(pons, 0.003 ether);
        vm.prank(relayer);
        uint256 out = cb.buy{value: 0.003 ether}(
            pons, q.mid, q.leg1, q.leg2, (q.amountOut * 98) / 100, buyer, block.timestamp + 600, address(0)
        );
        assertGt(out, 0, "bought");
        assertEq(IERC20(pons).balanceOf(buyer), out);
        assertEq(address(cb).balance, 0);
        console2.log("Pons token bought:", out / 1e18);
    }

    function test_minOutTooHighRefundsEth() public {
        if (!on) return;
        uint256 amt = 0.01 ether;
        StoaRouter.Quote memory q = _route(STOA, amt);
        uint256 e0 = buyer.balance;
        uint256 out = _buy(STOA, amt, q.amountOut * 2);
        assertEq(out, 0, "refunded");
        assertEq(buyer.balance - e0, amt, "buyer got the ETH back");
        assertEq(IERC20(STOA).balanceOf(buyer), 0);
        assertEq(address(cb).balance, 0);
    }

    function test_expiredDeadlineRefundsEth() public {
        if (!on) return;
        uint256 amt = 0.005 ether;
        StoaRouter.Quote memory q = _route(STOA, amt);
        uint256 e0 = buyer.balance;
        vm.prank(relayer);
        uint256 out = cb.buy{value: amt}(STOA, q.mid, q.leg1, q.leg2, 1, buyer, block.timestamp - 1, address(0));
        assertEq(out, 0);
        assertEq(buyer.balance - e0, amt);
    }

    function test_bogusRouteRefundsEth() public {
        if (!on) return;
        uint256 e0 = buyer.balance;
        StoaRouter.Leg memory bad = StoaRouter.Leg({venue: address(0xdead), isPool: false});
        vm.prank(relayer);
        uint256 out =
            cb.buy{value: 0.003 ether}(STOA, address(0), bad, bad, 1, buyer, block.timestamp + 600, address(0));
        assertEq(out, 0);
        assertEq(buyer.balance - e0, 0.003 ether);
    }

    function test_buyerThatRejectsEthReverts() public {
        if (!on) return;
        StoaRouter.Quote memory q = _route(STOA, 0.003 ether);
        address noEth = address(new NoReceive());
        vm.prank(relayer);
        vm.expectRevert(StoaCrossBuy.RefundFailed.selector);
        cb.buy{value: 0.003 ether}(
            STOA, q.mid, q.leg1, q.leg2, type(uint256).max, noEth, block.timestamp + 600, address(0)
        );
    }

    function test_rejectsZeroBuyerAndZeroValue() public {
        if (!on) return;
        StoaRouter.Quote memory q = _route(STOA, 0.003 ether);
        vm.expectRevert(StoaCrossBuy.ZeroAddress.selector);
        cb.buy{value: 0.003 ether}(STOA, q.mid, q.leg1, q.leg2, 1, address(0), block.timestamp + 600, address(0));
        vm.expectRevert(StoaCrossBuy.NoValue.selector);
        cb.buy(STOA, q.mid, q.leg1, q.leg2, 1, buyer, block.timestamp + 600, address(0));
    }
}

contract NoReceive {}
