// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console2} from "forge-std/Test.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {IVenueAdapter} from "../src/interfaces/IStoa.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {CLTickSpacingAdapter, ICLTickSpacingFactory} from "../src/adapters/CLTickSpacingAdapter.sol";
import {LiquidityBookAdapter, ILBFactory} from "../src/adapters/LiquidityBookAdapter.sol";
import {UniswapV4Adapter, IPoolManager, PoolKey} from "../src/adapters/UniswapV4Adapter.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VenuesElysium} from "../script/VenuesElysium.sol";

/// @notice The Elysium venues with real liquidity (Uniswap V4, Aero Slipstream, Ramses CL, Liquidity Book), live.
/// Skipped unless ELYSIUM_RPC_URL is set:  ELYSIUM_RPC_URL=... forge test --match-contract ForkVenues -vv
contract ForkVenuesTest is RouterHelper, VenuesElysium {
    /// a Montra launchpad token whose only pool is a Uniswap V4 native-HYPE pool
    address constant LAUNCH = 0x7e7384E8c7E622e0BBF5813c399fFA4AdB22DC44;

    StoaRouter router;
    FeeDistributor fees;
    CLTickSpacingAdapter aero;
    CLTickSpacingAdapter ramses;
    LiquidityBookAdapter lb;
    UniswapV4Adapter v4;
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ELYSIUM_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        // Elysium is an Arbitrum Orbit chain; Aero's swap hook reads ArbSys, which the local fork EVM lacks.
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        MakerRegistry reg = new MakerRegistry(address(this), address(this), 1 days);
        fees = new FeeDistributor(address(this), IMakerRegistry(address(reg)));
        router =
            new StoaRouter(address(this), IFeeDistributor(address(fees)), WHYPE, ISignatureTransfer(PERMIT2), 1 days);
        aero = new CLTickSpacingAdapter(ICLTickSpacingFactory(AERO_CL_FACTORY), address(router), aeroSpacings());
        ramses = new CLTickSpacingAdapter(ICLTickSpacingFactory(RAMSES_CL_FACTORY), address(router), ramsesSpacings());
        lb = new LiquidityBookAdapter(ILBFactory(LB_FACTORY), address(router));
        v4 = new UniswapV4Adapter(IPoolManager(V4_POOL_MANAGER), WHYPE, address(router), address(this), v4Hooks());
        router.addAdapter(address(aero));
        router.addAdapter(address(ramses));
        router.addAdapter(address(lb));
        router.addAdapter(address(v4));
        fees.setNotifier(address(router), true);
        vm.deal(alice, 1_000 ether);
    }

    function _launchKey() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: address(0),
            currency1: LAUNCH,
            fee: 0x800000,
            tickSpacing: 200,
            hooks: 0x6b1216A40B65c83e9c9e18a562C446697B8cf8EC
        });
    }

    function test_fork_eachVenueQuotesHypeUsdc() public {
        if (!on) return vm.skip(true);
        uint256 qa = aero.quote(WHYPE, USDC, 1 ether);
        uint256 qr = ramses.quote(WHYPE, USDC, 1 ether);
        uint256 ql = lb.quote(WHYPE, USDC, 1 ether);
        console2.log("1 WHYPE -> USDC  aero:", qa, " ramses:", qr);
        console2.log("                 liquidity book:", ql);
        assertGt(qa, 0, "aero");
        assertGt(qr, 0, "ramses");
        if (ql == 0) {
            // live state: the Liquidity Book WHYPE/USDC pair can be too thin for 1 WHYPE; it must still fill a small size
            uint256 small = lb.quote(WHYPE, USDC, 0.01 ether);
            console2.log("liquidity book thin today, 0.01 WHYPE ->", small);
            assertGt(small, 0, "lb");
        }
        StoaRouter.Quote memory q = router.quote(address(0), USDC, 1 ether);
        uint256 best = qa > qr ? qa : qr;
        best = best > ql ? best : ql;
        assertEq(q.amountOut, best - best * 2 / 10_000, "router picks the best venue");
    }

    function test_fork_swapHypeToUsdcAndBackOnBestVenue() public {
        if (!on) return vm.skip(true);
        StoaRouter.Quote memory q = router.quote(address(0), USDC, 5 ether);
        uint256 out = _swapAs(router, alice, address(0), USDC, 5 ether, q.amountOut, alice, address(0));
        console2.log("5 HYPE ->", out, "USDC raw via", q.leg1.venue);
        assertEq(out, q.amountOut);
        assertEq(IERC20(USDC).balanceOf(alice), out);
        vm.prank(alice);
        IERC20(USDC).approve(address(router), out);
        uint256 before = alice.balance;
        uint256 back = _swapAs(router, alice, USDC, address(0), out, 0, alice, address(0));
        console2.log("back ->", back, "wei HYPE");
        assertEq(alice.balance - before, back);
        assertGt(back, 4.9 ether, "round trip loses < 2%");
        _assertAdaptersEmpty();
    }

    function test_fork_eachAdapterExecutes() public {
        if (!on) return vm.skip(true);
        address[3] memory ads = [address(aero), address(ramses), address(lb)];
        for (uint256 i; i < 3; ++i) {
            // 1 HYPE, or 0.01 HYPE on a venue too thin for 1 HYPE on today's live state
            uint256 amt = IVenueAdapter(ads[i]).quote(WHYPE, USDC, 1 ether) > 0 ? 1 ether : 0.01 ether;
            StoaRouter.SwapParams memory p = _params(router, address(0), USDC, amt, 1, alice, address(0));
            p.mid = address(0);
            p.leg1 = StoaRouter.Leg(ads[i], false);
            vm.prank(alice);
            uint256 out = router.swap{value: amt}(p);
            console2.log("adapter", i, "filled HYPE wei", amt);
            console2.log("  -> USDC raw", out);
            assertGt(out, 0);
        }
        _assertAdaptersEmpty();
    }

    function test_fork_v4LaunchpadTokenNativePool() public {
        if (!on) return vm.skip(true);
        v4.register(_launchKey());
        assertEq(v4.keysFor(WHYPE, LAUNCH).length, 1);

        StoaRouter.Quote memory q = router.quote(address(0), LAUNCH, 0.05 ether);
        assertEq(q.leg1.venue, address(v4), "filled on Uniswap V4");
        uint256 got = _swapAs(router, alice, address(0), LAUNCH, 0.05 ether, q.amountOut * 99 / 100, alice, address(0));
        console2.log("0.05 HYPE ->", got, "LAUNCH wei");
        assertGt(got, 0);
        assertEq(IERC20(LAUNCH).balanceOf(alice), got);

        // sell back to USDC: LAUNCH -> HYPE on V4, then HYPE -> USDC on the best HYPE/USDC venue
        StoaRouter.Quote memory h = router.quote(LAUNCH, USDC, got / 2);
        console2.log("LAUNCH -> USDC route mid:", h.mid, " leg2:", h.leg2.venue);
        assertEq(h.mid, WHYPE, "two legs through WHYPE");
        assertEq(h.leg1.venue, address(v4));
        vm.prank(alice);
        IERC20(LAUNCH).approve(address(router), got / 2);
        uint256 usd = _swapAs(router, alice, LAUNCH, USDC, got / 2, h.amountOut * 99 / 100, alice, address(0));
        console2.log("half of it ->", usd, "USDC raw");
        assertGt(usd, 0);
        _assertAdaptersEmpty();
    }

    function test_fork_v4RegistryRules() public {
        if (!on) return vm.skip(true);
        PoolKey memory k = _launchKey();
        v4.register(k);
        vm.expectRevert(UniswapV4Adapter.Known.selector);
        v4.register(k);

        PoolKey memory bad = _launchKey();
        bad.hooks = address(0xBEEF);
        vm.expectRevert(UniswapV4Adapter.HookNotAllowed.selector);
        v4.register(bad);

        PoolKey memory ghost = _launchKey();
        ghost.tickSpacing = 60; // no such pool
        vm.expectRevert(UniswapV4Adapter.NotInitialized.selector);
        v4.register(ghost);

        vm.prank(alice);
        vm.expectRevert();
        v4.unregister(k);
        v4.unregister(k);
        assertEq(v4.keysFor(WHYPE, LAUNCH).length, 0);
    }

    function test_fork_adaptersRejectStrangersAndFakeCallbacks() public {
        if (!on) return vm.skip(true);
        vm.expectRevert(CLTickSpacingAdapter.OnlyRouter.selector);
        aero.swap(WHYPE, USDC, 1 ether, 0, alice);
        vm.expectRevert(LiquidityBookAdapter.OnlyRouter.selector);
        lb.swap(WHYPE, USDC, 1 ether, 0, alice);
        vm.expectRevert(UniswapV4Adapter.OnlyRouter.selector);
        v4.swap(WHYPE, USDC, 1 ether, 0, alice);
        vm.expectRevert(UniswapV4Adapter.OnlyPoolManager.selector);
        v4.unlockCallback("");
        vm.expectRevert();
        aero.uniswapV3SwapCallback(1, -1, abi.encode(false));
    }

    function _assertAdaptersEmpty() internal view {
        address[4] memory ads = [address(aero), address(ramses), address(lb), address(v4)];
        for (uint256 i; i < 4; ++i) {
            assertEq(IERC20(WHYPE).balanceOf(ads[i]), 0, "adapter keeps no WHYPE");
            assertEq(IERC20(USDC).balanceOf(ads[i]), 0, "adapter keeps no USDC");
            assertEq(ads[i].balance, 0, "adapter keeps no HYPE");
        }
        assertEq(IERC20(WHYPE).balanceOf(address(router)), 0);
        assertEq(IERC20(USDC).balanceOf(address(router)), 0);
    }
}

/// @dev Stand-in for Arbitrum's ArbSys precompile (0x64) in local forks.
contract ArbSysMock {
    function arbBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function arbChainID() external view returns (uint256) {
        return block.chainid;
    }
}
