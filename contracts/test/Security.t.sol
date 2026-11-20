// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RouterHelper} from "./utils/RouterHelper.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaPool} from "../src/StoaPool.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {MockToken, MockWHYPE, MockAdapter, LyingPool, SkimmingPool, TaxToken, MockPermit2} from "./mocks/Mocks.sol";

/// @notice Attacks and admin-safety checks on the router.
contract SecurityTest is RouterHelper {
    MakerRegistry reg;
    FeeDistributor fees;
    StoaRouter router;
    MockPermit2 permit2;
    MockWHYPE whype;
    MockToken usdc;
    address gov = makeAddr("gov");
    address guard = makeAddr("guard");
    address alice = makeAddr("alice");

    function setUp() public {
        whype = new MockWHYPE();
        usdc = new MockToken("USDC", 6);
        reg = new MakerRegistry(gov, gov, 1 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        permit2 = new MockPermit2();
        router = _router(1 days);
        vm.prank(gov);
        fees.setNotifier(address(router), true);
        usdc.mint(alice, 10_000e6);
        whype.mint(alice, 100 ether);
        vm.deal(address(whype), 1_000 ether);
        vm.startPrank(alice);
        usdc.approve(address(router), type(uint256).max);
        whype.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _router(uint256 delay) internal returns (StoaRouter) {
        return new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(whype), ISignatureTransfer(address(permit2)), delay
        );
    }

    function _p(uint256 minOut) internal returns (StoaRouter.SwapParams memory) {
        return _params(router, address(usdc), address(whype), 100e6, minOut, alice, address(0));
    }

    function _swap(uint256 minOut) internal returns (uint256) {
        StoaRouter.SwapParams memory p = _p(minOut);
        vm.prank(alice);
        return router.swap(p);
    }

    // ------------------------------------------------ the router never trusts a venue

    function test_lyingPoolCannotTakeFunds() public {
        LyingPool evil = new LyingPool(address(whype), address(usdc));
        vm.prank(gov);
        router.addPool(address(evil));
        uint256 bal = usdc.balanceOf(alice);
        StoaRouter.SwapParams memory p = _p(1);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.Slippage.selector);
        router.swap(p);
        assertEq(usdc.balanceOf(alice), bal, "user keeps the input");
    }

    function test_lyingPoolPayingDustStillReverts() public {
        LyingPool evil = new LyingPool(address(whype), address(usdc));
        whype.mint(address(evil), 1 ether);
        evil.setPayHalf(true); // pays 1 wei, claims a fortune
        vm.prank(gov);
        router.addPool(address(evil));
        StoaRouter.SwapParams memory p = _p(0.5 ether);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.Slippage.selector);
        router.swap(p);
    }

    function test_venueMustSpendExactInput() public {
        SkimmingPool evil = new SkimmingPool(address(whype), address(usdc));
        whype.mint(address(evil), 10 ether);
        vm.prank(gov);
        router.addPool(address(evil));
        StoaRouter.SwapParams memory p = _p(0);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.InputNotSpent.selector);
        router.swap(p);
    }

    function test_feeOnTransferInputRejected() public {
        TaxToken tax = new TaxToken();
        tax.mint(alice, 1_000 ether);
        MockAdapter ad = new MockAdapter(1, 1);
        usdc.mint(address(ad), 1_000e6);
        vm.prank(gov);
        router.addAdapter(address(ad));
        StoaRouter.SwapParams memory p = _params(router, address(tax), address(usdc), 100 ether, 0, alice, address(0));
        vm.startPrank(alice);
        tax.approve(address(router), type(uint256).max);
        vm.expectRevert(StoaRouter.BadToken.selector);
        router.swap(p);
        vm.stopPrank();
    }

    function test_badRecipientAndSameToken() public {
        MockAdapter ad = new MockAdapter(1, 1);
        whype.mint(address(ad), 100 ether);
        usdc.mint(address(ad), 100_000e6);
        vm.prank(gov);
        router.addAdapter(address(ad));
        StoaRouter.SwapParams memory p = _p(0);
        vm.startPrank(alice);
        p.to = address(0);
        vm.expectRevert(StoaRouter.BadRecipient.selector);
        router.swap(p);
        p.to = address(router);
        vm.expectRevert(StoaRouter.BadRecipient.selector);
        router.swap(p);
        p.to = alice;
        p.tokenOut = address(usdc);
        vm.expectRevert(StoaRouter.BadToken.selector);
        router.swap(p);
        vm.stopPrank();
    }

    // ------------------------------------------------ timelock on new venues

    function test_afterSetupNewVenuesWaitForDelay() public {
        MockAdapter ad = new MockAdapter(1, 1);
        vm.startPrank(gov);
        router.lockSetup();
        vm.expectRevert(StoaRouter.SetupIsLocked.selector);
        router.addAdapter(address(ad));
        router.propose(false, address(ad));
        vm.expectRevert(StoaRouter.TooEarly.selector);
        router.execute(false, address(ad));
        skip(1 days);
        router.execute(false, address(ad));
        vm.stopPrank();
        assertEq(router.adapters(0), address(ad));
    }

    function test_proposalCanBeCancelled() public {
        MockAdapter ad = new MockAdapter(1, 1);
        vm.startPrank(gov);
        router.lockSetup();
        router.propose(false, address(ad));
        router.cancel(false, address(ad));
        skip(2 days);
        vm.expectRevert(StoaRouter.NotProposed.selector);
        router.execute(false, address(ad));
        vm.stopPrank();
    }

    function test_onlyOwnerManagesVenues() public {
        MockAdapter ad = new MockAdapter(1, 1);
        vm.startPrank(alice);
        vm.expectRevert();
        router.addAdapter(address(ad));
        vm.expectRevert();
        router.propose(false, address(ad));
        vm.expectRevert();
        router.lockSetup();
        vm.stopPrank();
    }

    function test_delayBounds() public {
        vm.expectRevert(StoaRouter.BadDelay.selector);
        _router(10 minutes);
        vm.expectRevert(StoaRouter.BadDelay.selector);
        _router(30 days);
    }

    // ------------------------------------------------ emergency pause

    function test_guardianPausesOwnerUnpauses() public {
        MockAdapter ad = new MockAdapter(1e12, 1); // 1 USDC raw -> 1e12 wei
        whype.mint(address(ad), 1_000 ether);
        vm.startPrank(gov);
        router.addAdapter(address(ad));
        router.setGuardian(guard);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(StoaRouter.NotGuardian.selector);
        router.pause();

        StoaRouter.SwapParams memory p = _p(0);
        vm.prank(guard);
        router.pause();
        vm.prank(alice);
        vm.expectRevert(StoaRouter.IsPaused.selector);
        router.swap(p);
        vm.deal(alice, 1 ether);
        p.tokenIn = address(0);
        p.tokenOut = address(usdc);
        p.amountIn = 1 ether;
        vm.prank(alice);
        vm.expectRevert(StoaRouter.IsPaused.selector);
        router.swap{value: 1 ether}(p);

        vm.prank(guard);
        vm.expectRevert();
        router.unpause();
        vm.prank(gov);
        router.unpause();
        assertGt(_swap(1), 0);
    }

    // ------------------------------------------------ fuzz: output always measured

    function testFuzz_userAlwaysGetsAtLeastMinOut(uint256 num, uint256 amt) public {
        num = bound(num, 1, 1e13);
        amt = bound(amt, 1, 1_000e6);
        MockAdapter ad = new MockAdapter(num, 1);
        whype.mint(address(ad), type(uint128).max);
        vm.prank(gov);
        router.addAdapter(address(ad));
        StoaRouter.SwapParams memory p = _params(router, address(usdc), address(whype), amt, 0, alice, address(0));
        StoaRouter.Quote memory q = router.quote(address(usdc), address(whype), amt);
        p.minOut = q.amountOut;
        uint256 before = whype.balanceOf(alice);
        vm.prank(alice);
        try router.swap(p) returns (uint256 out) {
            assertEq(whype.balanceOf(alice) - before, out);
            assertGe(out, q.amountOut);
        } catch {
            assertEq(q.amountOut, 0);
        }
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(whype.balanceOf(address(router)), 0);
    }
    // ------------------------------------------------ routes are restricted to registered venues

    function _adapter() internal returns (MockAdapter ad) {
        ad = new MockAdapter(1e12, 1);
        whype.mint(address(ad), 1_000 ether);
        usdc.mint(address(ad), 1_000_000e6);
        vm.prank(gov);
        router.addAdapter(address(ad));
    }

    function test_unregisteredVenueRejected() public {
        _adapter();
        MockAdapter rogue = new MockAdapter(1e12, 1);
        whype.mint(address(rogue), 1_000 ether);
        StoaRouter.SwapParams memory p = _p(0);
        p.leg1 = StoaRouter.Leg(address(rogue), false);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.UnknownVenue.selector);
        router.swap(p);
        // an adapter address flagged as a pool is not a pool
        p.leg1 = StoaRouter.Leg(router.adapters(0), true);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.UnknownVenue.selector);
        router.swap(p);
    }

    function test_poolForAnotherPairRejected() public {
        MockToken other = new MockToken("OTHER", 18);
        StoaPool p2 = new StoaPool(
            address(other), address(usdc), IMakerRegistry(address(reg)), IFeeDistributor(address(fees)), gov, 500e6
        );
        vm.startPrank(gov);
        reg.listPool(address(p2), 1 ether);
        router.addPool(address(p2));
        vm.stopPrank();
        StoaRouter.SwapParams memory p = _p(0);
        p.leg1 = StoaRouter.Leg(address(p2), true);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.UnknownVenue.selector);
        router.swap(p);
    }

    function test_removedVenueRejected() public {
        MockAdapter ad = _adapter();
        StoaRouter.SwapParams memory p = _p(0);
        vm.prank(gov);
        router.removeAdapter(address(ad));
        vm.prank(alice);
        vm.expectRevert(StoaRouter.UnknownVenue.selector);
        router.swap(p);
    }

    function test_hopCannotUseEndpointsAsMid() public {
        _adapter();
        StoaRouter.SwapParams memory p = _p(0);
        p.mid = address(usdc);
        p.leg2 = p.leg1;
        vm.prank(alice);
        vm.expectRevert(StoaRouter.BadToken.selector);
        router.swap(p);
    }

    // ------------------------------------------------ native value checks

    function test_valueMustMatch() public {
        _adapter();
        vm.deal(alice, 10 ether);
        StoaRouter.SwapParams memory p = _params(router, address(0), address(usdc), 1 ether, 0, alice, address(0));
        vm.prank(alice);
        vm.expectRevert(StoaRouter.BadValue.selector);
        router.swap{value: 0.5 ether}(p);
        StoaRouter.SwapParams memory e = _p(0);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.BadValue.selector);
        router.swap{value: 1}(e);
    }

    // ------------------------------------------------ sweep

    function test_sweepReturnsStrayTokensOwnerOnly() public {
        usdc.mint(address(router), 5e6);
        vm.prank(alice);
        vm.expectRevert();
        router.sweep(address(usdc), alice);
        vm.prank(gov);
        router.sweep(address(usdc), alice);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(alice), 10_000e6 + 5e6);
        vm.prank(gov);
        vm.expectRevert(StoaRouter.ZeroAddress.selector);
        router.sweep(address(usdc), address(0));
    }

    // ------------------------------------------------ Permit2

    function _permit(uint256 amount, uint256 nonce)
        internal
        view
        returns (ISignatureTransfer.PermitTransferFrom memory)
    {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(usdc), amount: amount}),
            nonce: nonce,
            deadline: block.timestamp
        });
    }

    function test_permit2SwapWithoutRouterApproval() public {
        _adapter();
        vm.startPrank(alice);
        usdc.approve(address(router), 0);
        usdc.approve(address(permit2), type(uint256).max);
        vm.stopPrank();
        StoaRouter.SwapParams memory p = _p(1);
        uint256 before = whype.balanceOf(alice);
        vm.prank(alice);
        uint256 out = router.swapWithPermit2(p, _permit(100e6, 7), hex"01");
        assertEq(whype.balanceOf(alice) - before, out);
        assertGt(out, 0);
        // the nonce is spent
        vm.prank(alice);
        vm.expectRevert(bytes("nonce"));
        router.swapWithPermit2(p, _permit(100e6, 7), hex"01");
    }

    function test_permit2TokenMustMatch() public {
        _adapter();
        StoaRouter.SwapParams memory p = _p(0);
        ISignatureTransfer.PermitTransferFrom memory pm = _permit(100e6, 1);
        pm.permitted.token = address(whype);
        vm.prank(alice);
        vm.expectRevert(StoaRouter.BadToken.selector);
        router.swapWithPermit2(p, pm, hex"01");
    }

    function test_permit2PullsFromCallerOnly() public {
        _adapter();
        address bob = makeAddr("bob");
        vm.prank(alice);
        usdc.approve(address(permit2), type(uint256).max);
        StoaRouter.SwapParams memory p = _p(0);
        uint256 bal = usdc.balanceOf(alice);
        // bob replays alice's permit: Permit2 checks the signature against msg.sender (bob), who has no USDC
        vm.prank(bob);
        vm.expectRevert();
        router.swapWithPermit2(p, _permit(100e6, 3), hex"01");
        assertEq(usdc.balanceOf(alice), bal);
    }
}
