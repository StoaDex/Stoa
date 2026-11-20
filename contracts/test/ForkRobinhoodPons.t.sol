// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {PonsCurveAdapter, IPonsCurve} from "../src/adapters/PonsCurveAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice PonsCurveAdapter against the LIVE Robinhood Chain router and a live Pons bonding curve. $STOA has graduated
///         to Uniswap V4, so the test picks the newest ETH-quoted Pons launch still on its curve with at least 1 ETH
///         of room before graduation (or the token in PONS_TOKEN). The adapter is added to the router the way the
///         timelock does it (propose, wait the router delay, execute).
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodPons -vv
contract ForkRobinhoodPonsTest is RouterHelper {
    address constant LIVE_ROUTER = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5;
    address constant PONS_FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant STOA = 0x13E6993417616De724F2b337D65063f229e96718; // graduated to Uniswap V4
    /// PonsFactory TokenLaunched(address indexed token, address indexed curve, address indexed creator, ...)
    bytes32 constant LAUNCHED = 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607;
    address constant MRDN = 0x6437614eA1efBa0eB4b43bC1aF53808722B1Cf13; // a Pons token that already graduated

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    PonsCurveAdapter pons;
    address TOKEN; // the Pons token under test, still on its curve
    IPonsCurve curve;
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        pons = new PonsCurveAdapter(PONS_FACTORY, WETH, LIVE_ROUTER);
        vm.deal(alice, 100 ether);
        (TOKEN, curve) = _liveCurve();
        if (TOKEN == address(0)) {
            console2.log("no ETH-quoted Pons curve with room found: set PONS_TOKEN");
            on = false;
        } else {
            console2.log("Pons token under test", TOKEN, "curve", address(curve));
        }
    }

    /// @dev PONS_TOKEN if set, else the newest launch whose curve the adapter trades and that is at least 1 ETH from
    ///      graduating, so the buys below never graduate it
    function _liveCurve() internal returns (address token, IPonsCurve c) {
        token = vm.envOr("PONS_TOKEN", address(0));
        if (token != address(0)) return (token, pons.curveOf(token));
        uint256 head = vm.getBlockNumber();
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = LAUNCHED;
        Vm.EthGetLogs[] memory logs = vm.eth_getLogs(head > 400_000 ? head - 400_000 : 0, head, PONS_FACTORY, topics);
        for (uint256 i = logs.length; i > 0; --i) {
            address t = address(uint160(uint256(logs[i - 1].topics[1])));
            c = pons.curveOf(t);
            if (address(c) == address(0) || c.readyToGraduate()) continue;
            if (c.realQuoteReserve() + 1 ether >= c.graduationThreshold()) continue;
            return (t, c);
        }
        return (address(0), IPonsCurve(address(0)));
    }

    function _addToRouter() internal {
        address owner = router.owner();
        vm.prank(owner);
        router.propose(false, address(pons));
        vm.warp(block.timestamp + router.delay());
        vm.prank(owner);
        router.execute(false, address(pons));
        assertTrue(router.isAdapter(address(pons)));
    }

    /// direct adapter fill, as the router does it: WETH arrives first, then swap()
    function _buyDirect(uint256 a) internal returns (uint256 got) {
        deal(WETH, address(pons), a);
        vm.prank(LIVE_ROUTER);
        got = pons.swap(WETH, TOKEN, a, 0, alice);
    }

    function test_fork_curveIsFoundForPonsTokensOnly() public {
        if (!on) return vm.skip(true);
        assertEq(address(pons.curveOf(TOKEN)), address(curve));
        assertEq(curve.token(), TOKEN);
        assertEq(address(pons.curveOf(STOA)), address(0), "graduated Pons token: $STOA");
        assertEq(address(pons.curveOf(USDG)), address(0), "not a Pons token");
        assertEq(address(pons.curveOf(MRDN)), address(0), "graduated Pons token");
        assertEq(address(pons.curveOf(WETH)), address(0));
        assertEq(pons.quote(WETH, USDG, 1 ether), 0);
        assertEq(pons.quote(WETH, MRDN, 1 ether), 0);
        assertEq(pons.quote(USDG, TOKEN, 1e6), 0, "only WETH pairs; the router hops through WETH");
    }

    /// the quote is the curve's own math, to the wei, for buys of any size the curve fills without graduating
    function testFuzz_fork_buyQuoteIsExact(uint256 a) public {
        if (!on) return vm.skip(true);
        a = bound(a, 1e9, 0.5 ether);
        uint256 q = pons.quote(WETH, TOKEN, a);
        assertGt(q, 0);
        uint256 got = _buyDirect(a);
        assertEq(got, q, "buy fills exactly the quote");
        assertEq(IERC20(TOKEN).balanceOf(alice), got);
        assertEq(address(pons).balance, 0, "nothing left behind");
        assertEq(IERC20(WETH).balanceOf(address(pons)), 0);
    }

    function testFuzz_fork_sellQuoteIsExact(uint256 a, uint256 frac) public {
        if (!on) return vm.skip(true);
        a = bound(a, 0.001 ether, 0.5 ether);
        uint256 bought = _buyDirect(a);
        uint256 s = bound(frac, 1e15, bought);
        uint256 q = pons.quote(TOKEN, WETH, s);
        assertGt(q, 0);
        vm.prank(alice);
        IERC20(TOKEN).transfer(address(pons), s);
        vm.prank(LIVE_ROUTER);
        uint256 got = pons.swap(TOKEN, WETH, s, 0, alice);
        assertEq(got, q, "sell fills exactly the quote");
        assertEq(IERC20(WETH).balanceOf(alice), got);
        assertEq(address(pons).balance, 0);
        assertEq(IERC20(TOKEN).balanceOf(address(pons)), 0);
    }

    function test_fork_routerRoutesEthToTokenAndBack() public {
        if (!on) return vm.skip(true);
        _addToRouter();
        StoaRouter.Quote memory q = router.quote(address(0), TOKEN, 0.05 ether);
        assertEq(q.leg1.venue, address(pons), "only the curve has $TOKEN");
        assertEq(q.mid, address(0));
        uint256 got = _swapAs(router, alice, address(0), TOKEN, 0.05 ether, q.amountOut, alice, address(0));
        assertEq(got, q.amountOut, "user gets the quoted amount (2 bps router fee included)");
        console2.log("0.05 ETH ->", got / 1e18, "tokens");

        vm.prank(alice);
        IERC20(TOKEN).approve(address(router), got);
        uint256 e0 = alice.balance;
        StoaRouter.Quote memory b = router.quote(TOKEN, address(0), got);
        uint256 eth = _swapAs(router, alice, TOKEN, address(0), got, b.amountOut, alice, address(0));
        assertEq(eth, b.amountOut);
        assertEq(alice.balance - e0, eth);
        console2.log("back to ETH (wei):", eth);
        assertLt(eth, 0.05 ether, "round trip pays the curve fees");
    }

    function test_fork_usdgToTokenHopsThroughWeth() public {
        if (!on) return vm.skip(true);
        _addToRouter();
        deal(USDG, alice, 100e6);
        vm.prank(alice);
        IERC20(USDG).approve(address(router), 100e6);
        StoaRouter.Quote memory q = router.quote(USDG, TOKEN, 100e6);
        assertEq(q.mid, WETH, "USDG -> WETH on Uniswap, WETH -> token on the curve");
        assertEq(q.leg2.venue, address(pons));
        uint256 got = _swapAs(router, alice, USDG, TOKEN, 100e6, q.amountOut, alice, address(0));
        assertEq(got, q.amountOut);
        console2.log("100 USDG ->", got / 1e18, "tokens");
    }

    /// the buy that would take the last sellable tokens graduates the curve and refunds ETH: quoted as 0
    function test_fork_graduatingBuyIsLeftToPons() public {
        if (!on) return vm.skip(true);
        uint256 need = curve.graduationThreshold() - curve.realQuoteReserve(); // net ETH to graduate
        uint256 gross = need * 10_000 / (10_000 - curve.feeBps() - curve.creatorTaxBps()) + 1e12;
        assertEq(pons.quote(WETH, TOKEN, gross), 0, "would graduate");
        uint256 under = gross * 99 / 100;
        uint256 q = pons.quote(WETH, TOKEN, under);
        assertGt(q, 0, "just under still fills");
        assertEq(_buyDirect(under), q);
        assertFalse(curve.graduated());
        assertEq(pons.quote(WETH, TOKEN, gross / 50), 0, "the last ~2% would graduate it now");

        deal(WETH, address(pons), gross);
        vm.prank(LIVE_ROUTER);
        vm.expectRevert(PonsCurveAdapter.NoPath.selector);
        pons.swap(WETH, TOKEN, gross, 0, alice);
    }

    function test_fork_strayEthDoesNotBlockBuys() public {
        if (!on) return vm.skip(true);
        vm.deal(address(pons), 1 wei);
        uint256 q = pons.quote(WETH, TOKEN, 0.01 ether);
        assertEq(_buyDirect(0.01 ether), q);
        assertEq(address(pons).balance, 1 wei);
    }

    function test_fork_onlyRouterSwaps() public {
        if (!on) return vm.skip(true);
        deal(WETH, address(pons), 0.01 ether);
        vm.expectRevert(PonsCurveAdapter.OnlyRouter.selector);
        pons.swap(WETH, TOKEN, 0.01 ether, 0, alice);
    }

    function test_fork_minOutIsEnforced() public {
        if (!on) return vm.skip(true);
        uint256 q = pons.quote(WETH, TOKEN, 0.01 ether);
        deal(WETH, address(pons), 0.01 ether);
        vm.prank(LIVE_ROUTER);
        vm.expectRevert(PonsCurveAdapter.Slippage.selector);
        pons.swap(WETH, TOKEN, 0.01 ether, q + 1, alice);
    }

    /// other live Pons launches (different creator taxes and curve states): exact buy and sell on each one the adapter
    /// trades, and nothing for curves quoted in another token
    function test_fork_otherPonsCurves() public {
        if (!on) return vm.skip(true);
        address[6] memory toks = [
            0x21E070bE0800b2b30Bb3DE18c86D7A3Cd49468AD,
            0x9a92f89Aeb1c464a72f510d093F646D7E345D7b8,
            0x7e2434E9B3750db6A148DA53d444957b9DfE8F6B,
            0xa5D2c3797F32Cd062F74887256e574CB35ADE38a,
            0x894C0E4bed2FEB74eB0aE759BE21f14cFCea505b, // quoted in a token, not ETH
            0xe3B88d3d2e389F2A3d9ab35E26674C9548Fe0E24 // quoted in a token, not ETH
        ];
        uint256 traded;
        for (uint256 i; i < toks.length; ++i) {
            address t = toks[i];
            IPonsCurve c = pons.curveOf(t);
            if (address(c) == address(0)) {
                assertEq(pons.quote(WETH, t, 0.002 ether), 0);
                continue;
            }
            uint256 q = pons.quote(WETH, t, 0.002 ether);
            deal(WETH, address(pons), 0.002 ether);
            vm.prank(LIVE_ROUTER);
            uint256 got = pons.swap(WETH, t, 0.002 ether, 0, alice);
            assertEq(got, q, "buy exact");
            uint256 s = got / 2;
            uint256 qs = pons.quote(t, WETH, s);
            vm.prank(alice);
            IERC20(t).transfer(address(pons), s);
            vm.prank(LIVE_ROUTER);
            assertEq(pons.swap(t, WETH, s, 0, alice), qs, "sell exact");
            console2.log("traded on curve", address(c), "creator tax bps", c.creatorTaxBps());
            ++traded;
        }
        assertGe(traded, 3, "several live curves");
        assertEq(address(pons.curveOf(toks[4])), address(0));
        assertEq(address(pons.curveOf(toks[5])), address(0));
    }
}
