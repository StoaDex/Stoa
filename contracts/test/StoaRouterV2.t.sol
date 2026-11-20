// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {StoaRouterV2} from "../src/StoaRouterV2.sol";
import {IMakerRegistry, IFeeDistributor, IVenueAdapter} from "../src/interfaces/IStoa.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2, TaxToken} from "./mocks/Mocks.sol";

/// @dev Constant-product venue for one pair (out = rOut * in / (rIn + in)), so splitting a large swap over two of
///      them gives more output than sending it all through one.
contract CurveAdapter is IVenueAdapter {
    mapping(address => uint256) public reserve;
    address public t0;
    address public t1;

    constructor(address a, address b) {
        (t0, t1) = (a, b);
    }

    function seed(uint256 r0, uint256 r1) external {
        reserve[t0] = r0;
        reserve[t1] = r1;
    }

    function quote(address a, address b, uint256 x) public view returns (uint256) {
        require((a == t0 && b == t1) || (a == t1 && b == t0), "pair");
        return reserve[b] * x / (reserve[a] + x);
    }

    function swap(address a, address b, uint256 x, uint256 minOut, address to) external returns (uint256 out) {
        out = quote(a, b, x);
        require(out >= minOut, "slippage");
        reserve[a] += x;
        reserve[b] -= out;
        IERC20(b).transfer(to, out);
    }
}

contract StoaRouterV2Test is Test {
    MakerRegistry reg;
    FeeDistributor fees;
    StoaRouterV2 router;
    MockWHYPE whype;
    MockToken usdg;
    MockToken meme;
    TaxToken tax;
    MockPermit2 permit2;

    address gov = makeAddr("gov");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        whype = new MockWHYPE();
        usdg = new MockToken("USDG", 6);
        meme = new MockToken("MEME", 18);
        tax = new TaxToken();
        reg = new MakerRegistry(gov, gov, 1 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        permit2 = new MockPermit2();
        router = new StoaRouterV2(
            gov, IFeeDistributor(address(fees)), address(whype), ISignatureTransfer(address(permit2)), 1 days
        );
        vm.prank(gov);
        fees.setNotifier(address(router), true);

        whype.mint(alice, 1_000 ether);
        usdg.mint(alice, 10_000_000e6);
        vm.deal(alice, 1_000 ether);
        vm.startPrank(alice);
        whype.approve(address(router), type(uint256).max);
        usdg.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _curve(address a, address b, uint256 ra, uint256 rb) internal returns (CurveAdapter c) {
        c = new CurveAdapter(a, b);
        c.seed(ra, rb);
        _fund(a, address(c), ra);
        _fund(b, address(c), rb);
        vm.prank(gov);
        router.addAdapter(address(c));
    }

    function _fund(address t, address to, uint256 amt) internal {
        if (t == address(whype)) {
            whype.mint(to, amt);
            vm.deal(address(whype), address(whype).balance + amt); // back the minted WHYPE so withdraw works
        } else if (t == address(tax)) {
            tax.mint(to, amt);
        } else {
            MockToken(t).mint(to, amt);
        }
    }

    function _params(StoaRouterV2.Quote memory q, address tin, address tout, uint256 amt, uint256 minOut)
        internal
        view
        returns (StoaRouterV2.SwapParams memory p)
    {
        p = StoaRouterV2.SwapParams({
            tokenIn: tin,
            tokenOut: tout,
            routes: q.routes,
            amountIn: amt,
            minOut: minOut,
            to: alice,
            deadline: block.timestamp,
            referrer: address(0)
        });
    }

    // ------------------------------------------------------------------ single route (v1 behaviour)

    function test_singleRouteMatchesQuote() public {
        _curve(address(whype), address(usdg), 1_000 ether, 3_000_000e6);
        StoaRouterV2.Quote memory q = router.quote(address(0), address(usdg), 1 ether);
        assertEq(q.routes.length, 1);
        uint256 b0 = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 out = router.swap{value: 1 ether}(_params(q, address(0), address(usdg), 1 ether, q.amountOut));
        assertEq(out, q.amountOut);
        assertEq(usdg.balanceOf(alice) - b0, out);
        // the 2 bps router fee went to the distributor and was notified
        assertEq(fees.accounted(address(usdg)), usdg.balanceOf(address(fees)));
        assertGt(usdg.balanceOf(address(fees)), 0);
    }

    function test_nativeOut() public {
        _curve(address(whype), address(usdg), 1_000 ether, 3_000_000e6);
        StoaRouterV2.Quote memory q = router.quote(address(usdg), address(0), 3_000e6);
        uint256 e0 = alice.balance;
        vm.prank(alice);
        uint256 out = router.swap(_params(q, address(usdg), address(0), 3_000e6, q.amountOut));
        assertEq(alice.balance - e0, out);
        assertEq(out, q.amountOut);
    }

    // ------------------------------------------------------------------ K-1: tokens that tax transfers

    /// @dev v1: with no router fee on the leg, a taxed output token arrives below the trader's minimum and the
    ///      swap still succeeds (K-1); with the fee, the distributor reverts Unbacked.
    function test_v1_taxedOutputBelowMinimum() public {
        StoaRouter v1 = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(whype), ISignatureTransfer(address(permit2)), 1 days
        );
        MockAdapter m = new MockAdapter(100, 1); // 1 WHYPE -> 100 TAX
        tax.mint(address(m), 1_000_000 ether);
        vm.startPrank(gov);
        v1.addAdapter(address(m));
        v1.setFallbackFeeBps(0);
        fees.setNotifier(address(v1), true);
        vm.stopPrank();
        StoaRouter.Quote memory q = v1.quote(address(whype), address(tax), 1 ether);
        vm.startPrank(alice);
        whype.approve(address(v1), type(uint256).max);
        uint256 out = v1.swap(
            StoaRouter.SwapParams({
                tokenIn: address(whype),
                tokenOut: address(tax),
                mid: q.mid,
                leg1: q.leg1,
                leg2: q.leg2,
                amountIn: 1 ether,
                // the router measures 99 after the venue's taxed transfer; bob then gets 99% of that
                minOut: q.amountOut * 99 / 100,
                to: bob,
                deadline: block.timestamp,
                referrer: address(0)
            })
        );
        vm.stopPrank();
        assertEq(out, q.amountOut * 99 / 100, "v1 reports the minimum as met");
        assertLt(tax.balanceOf(bob), q.amountOut * 99 / 100, "but bob received less than the minimum");
    }

    function test_K1_minimumCheckedAgainstWhatRecipientReceived() public {
        MockAdapter m = new MockAdapter(100, 1);
        tax.mint(address(m), 1_000_000 ether);
        vm.startPrank(gov);
        router.addAdapter(address(m));
        router.setFallbackFeeBps(0);
        vm.stopPrank();
        StoaRouterV2.Quote memory q = router.quote(address(whype), address(tax), 1 ether);
        StoaRouterV2.SwapParams memory p = _params(q, address(whype), address(tax), 1 ether, q.amountOut);
        p.to = bob;
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.Slippage.selector);
        router.swap(p);

        // with a minimum below the taxed delivery, the swap goes through and reports what bob got
        p.minOut = q.amountOut * 97 / 100;
        vm.prank(alice);
        uint256 out = router.swap(p);
        assertEq(out, tax.balanceOf(bob));
        assertLt(out, q.amountOut);
    }

    function test_K1_routerFeeOnTaxedTokenNoLongerReverts() public {
        MockAdapter m = new MockAdapter(100, 1);
        tax.mint(address(m), 1_000_000 ether);
        vm.prank(gov);
        router.addAdapter(address(m)); // fee stays at 2 bps
        StoaRouterV2.Quote memory q = router.quote(address(whype), address(tax), 1 ether);
        StoaRouterV2.SwapParams memory p = _params(q, address(whype), address(tax), 1 ether, 0);
        p.minOut = 1;
        vm.prank(alice);
        router.swap(p);
        // what the distributor received is what it accounted
        assertEq(fees.accounted(address(tax)), tax.balanceOf(address(fees)));
        assertGt(tax.balanceOf(address(fees)), 0);
    }

    // ------------------------------------------------------------------ splits

    function test_splitBeatsSingleRouteAndExecutesExactly() public {
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        uint256 amt = 20 ether;
        StoaRouterV2.Quote memory single = router.quote(address(0), address(usdg), amt);
        StoaRouterV2.Quote memory split = router.quoteSplit(address(0), address(usdg), amt, 4);
        assertEq(split.routes.length, 2);
        assertGt(split.amountOut, single.amountOut);
        // ~ (1 - 20/110) vs (1 - 20/120) of the spot output: about 1.8% more
        assertGt(split.amountOut * 10_000 / single.amountOut, 10_150);

        uint256 b0 = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 out = router.swap{value: amt}(_params(split, address(0), address(usdg), amt, split.amountOut));
        assertEq(out, split.amountOut);
        assertEq(usdg.balanceOf(alice) - b0, out);
    }

    function test_splitFallsBackToSingleWhenNotBetter() public {
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        MockAdapter worse = new MockAdapter(1, 1_000_000_000_000); // almost nothing
        usdg.mint(address(worse), 1e12);
        vm.prank(gov);
        router.addAdapter(address(worse));
        StoaRouterV2.Quote memory split = router.quoteSplit(address(0), address(usdg), 1 ether, 5);
        assertEq(split.routes.length, 1);
    }

    function test_splitAmountsMustAddUp() public {
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        StoaRouterV2.Quote memory split = router.quoteSplit(address(0), address(usdg), 20 ether, 4);
        StoaRouterV2.SwapParams memory p = _params(split, address(whype), address(usdg), 20 ether, 1);
        p.routes[0].amountIn -= 1;
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.BadSplit.selector);
        router.swap(p);

        p.routes[0].amountIn = 0;
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.BadSplit.selector);
        router.swap(p);

        p.routes = new StoaRouterV2.Route[](0);
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.BadSplit.selector);
        router.swap(p);

        p.routes = new StoaRouterV2.Route[](6);
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.BadSplit.selector);
        router.swap(p);
    }

    function testFuzz_splitPaysWhatItQuotes(uint96 amt, uint8 parts) public {
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        _curve(address(whype), address(usdg), 50 ether, 151_000e6);
        uint256 a = bound(uint256(amt), 1e12, 200 ether);
        StoaRouterV2.Quote memory q = router.quoteSplit(address(0), address(usdg), a, bound(parts, 0, 9));
        vm.assume(q.amountOut > 0);
        uint256 sum;
        for (uint256 i; i < q.routes.length; ++i) {
            sum += q.routes[i].amountIn;
        }
        assertEq(sum, a);
        vm.deal(alice, a);
        vm.prank(alice);
        assertEq(router.swap{value: a}(_params(q, address(0), address(usdg), a, q.amountOut)), q.amountOut);
    }

    // ------------------------------------------------------------------ hop tokens

    function test_hopThroughListedToken() public {
        _curve(address(whype), address(usdg), 1_000 ether, 3_000_000e6);
        _curve(address(usdg), address(meme), 1_000_000e6, 1_000_000 ether); // MEME only trades against USDG
        StoaRouterV2.Quote memory q = router.quote(address(0), address(meme), 1 ether);
        assertEq(q.routes.length, 0, "not reachable through WHYPE");

        address[] memory h = new address[](1);
        h[0] = address(usdg);
        vm.prank(alice);
        vm.expectRevert();
        router.setHops(h);
        vm.prank(gov);
        router.setHops(h);

        q = router.quote(address(0), address(meme), 1 ether);
        assertEq(q.routes.length, 1);
        assertEq(q.routes[0].mid, address(usdg));
        uint256 b0 = meme.balanceOf(alice);
        vm.prank(alice);
        uint256 out = router.swap{value: 1 ether}(_params(q, address(0), address(meme), 1 ether, q.amountOut));
        assertEq(out, q.amountOut);
        assertEq(meme.balanceOf(alice) - b0, out);
    }

    function test_hopsBounded() public {
        address[] memory h = new address[](5);
        for (uint256 i; i < 5; ++i) {
            h[i] = address(uint160(100 + i));
        }
        vm.prank(gov);
        vm.expectRevert(StoaRouterV2.TooMany.selector);
        router.setHops(h);
        address[] memory w = new address[](1);
        w[0] = address(whype);
        vm.prank(gov);
        vm.expectRevert(StoaRouterV2.ZeroAddress.selector);
        router.setHops(w);
    }

    // ------------------------------------------------------------------ safety carried over from v1

    function test_unknownVenueRejected() public {
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        StoaRouterV2.Quote memory q = router.quote(address(0), address(usdg), 1 ether);
        StoaRouterV2.SwapParams memory p = _params(q, address(0), address(usdg), 1 ether, 1);
        p.routes[0].leg1.venue = address(new MockAdapter(1, 1));
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.UnknownVenue.selector);
        router.swap{value: 1 ether}(p);
    }

    function test_pausedAndExpired() public {
        _curve(address(whype), address(usdg), 100 ether, 300_000e6);
        StoaRouterV2.Quote memory q = router.quote(address(0), address(usdg), 1 ether);
        StoaRouterV2.SwapParams memory p = _params(q, address(0), address(usdg), 1 ether, 1);
        p.deadline = block.timestamp - 1;
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.Expired.selector);
        router.swap{value: 1 ether}(p);
        p.deadline = block.timestamp;
        vm.prank(gov);
        router.pause();
        vm.prank(alice);
        vm.expectRevert(StoaRouterV2.IsPaused.selector);
        router.swap{value: 1 ether}(p);
    }
}
