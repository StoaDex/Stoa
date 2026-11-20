// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {RouterHelper} from "./utils/RouterHelper.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {UniswapV4Adapter, PoolKey} from "../src/adapters/UniswapV4Adapter.sol";
import {IPonsCurve} from "../src/adapters/PonsCurveAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Pons graduations on the LIVE Robinhood Chain router: the Uniswap V4 pools the graduation watcher registered
///         swap both ways through Stoa, and $STOA's own graduation (forced on the fork) ends with $STOA routable once
///         its pool is registered, the way script/pons-graduations.sh does it.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodGraduation -vv
contract ForkRobinhoodGraduationTest is RouterHelper {
    address constant LIVE_ROUTER = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5;
    address constant V4 = 0x8965140Fb51b2E99a0Cd31a0E99Eae01D36517B8;
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant PONS_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    /// Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1, uint24 fee, int24 tickSpacing, IHooks hooks, uint160 sqrtPriceX96, int24 tick)
    bytes32 constant INITIALIZE = 0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant STOA = 0x13E6993417616De724F2b337D65063f229e96718;
    address constant STOA_CURVE = 0xD0b519310688e830C9aEE29Ae117eDc3fBb1C13f;
    address constant PONS_FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    UniswapV4Adapter v4 = UniswapV4Adapter(payable(V4));
    address alice = makeAddr("alice");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.deal(alice, 100 ether);
    }

    function _roundTrip(address token, uint256 ethIn) internal returns (uint256 got, uint256 back) {
        StoaRouter.Quote memory q = router.quote(address(0), token, ethIn);
        assertGt(q.amountOut, 0, "no route from ETH");
        got = _swapAs(router, alice, address(0), token, ethIn, q.amountOut, alice, address(0));
        assertEq(got, q.amountOut, "fills the quote");
        vm.prank(alice);
        IERC20(token).approve(address(router), got);
        StoaRouter.Quote memory s = router.quote(token, address(0), got);
        assertGt(s.amountOut, 0, "no route back to ETH");
        back = _swapAs(router, alice, token, address(0), got, s.amountOut, alice, address(0));
        assertEq(back, s.amountOut);
        assertLt(back, ethIn, "a round trip pays the pool fee and price impact");
    }

    /// graduation pools the watcher registered: each one buys and sells through the router
    function test_fork_registeredGraduationsSwapBothWays() public {
        if (!on) return vm.skip(true);
        address[8] memory toks = [
            0x6437614eA1efBa0eB4b43bC1aF53808722B1Cf13, // MRDN
            0x1ead1942232dAe5a296EEa527B7feb871941D960, // CLOVER
            0xAf98E6F7f22560e4591184f828A280a6E986041D, // AGESIC
            0x839d6dea3DE497EE5a8338410CB2865aFa51141E, // PAYOLA
            0xb0b5bb465B3dcD5757e7BD30bdC85C3415Bf4e42, // SHERWOOD
            0x87362Bd644256f45274346ab6367C19aE0EA2546, // COASTR
            0x31CeD11f076e45dA2508da2Db4A2f296021A1E21, // ZENO
            0xa78557B829215D36C88303cE2F34448DdA9B46fA // EGL
        ];
        for (uint256 i; i < toks.length; i++) {
            PoolKey[] memory k = v4.keysFor(WETH, toks[i]);
            bool pons;
            for (uint256 j; j < k.length; j++) {
                if (k[j].hooks == PONS_HOOK && k[j].currency0 == address(0)) pons = true;
            }
            assertTrue(pons, "the Pons graduation pool (native ETH pair, Pons hook) is registered");
            (uint256 got, uint256 back) = _roundTrip(toks[i], 0.001 ether);
            console2.log(IERC20Sym(toks[i]).symbol(), got / 1e18, back);
        }
    }

    /// $STOA graduates: the buy that empties its curve creates the Pons V4 pool in the same transaction. Until that
    /// pool is registered Stoa has no route; registering it (anyone can, the watcher does) makes $STOA trade on Stoa,
    /// from ETH and from USDG, the token the weekly buyback spends.
    function test_fork_stoaGraduationThenRoutes() public {
        if (!on) return vm.skip(true);
        IPonsCurve c = IPonsCurve(STOA_CURVE);
        if (c.graduated()) {
            // already happened on mainnet: the route must exist by now
            assertGt(router.quote(address(0), STOA, 0.01 ether).amountOut, 0, "graduated but not routed");
            return;
        }
        vm.recordLogs();
        uint256 e0 = alice.balance;
        vm.prank(alice);
        c.buy{value: 5 ether}(5 ether, 0, alice);
        assertTrue(c.graduated(), "the curve graduated");
        console2.log("ETH spent to graduate (wei):", e0 - alice.balance);
        assertLt(e0 - alice.balance, 5 ether, "excess refunded");
        // Pons' buy helper creates the V4 pool in the same transaction; a plain curve buy leaves that step to the
        // next caller of the factory (Pons' UI or keeper). Do it here the way they do.
        vm.prank(makeAddr("poolCreator"));
        (bool ok, bytes memory err) = PONS_FACTORY.call(abi.encodeWithSignature("createGraduatedPool(address)", STOA));
        if (!ok) console2.logBytes(err);
        assertTrue(ok, "anyone can create the graduation pool");

        // the pool Pons created, from the PoolManager's Initialize log (what the watcher reads)
        PoolKey memory key;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            Vm.Log memory l = logs[i];
            if (l.emitter != POOL_MANAGER || l.topics[0] != INITIALIZE) continue;
            if (l.topics[2] != bytes32(0) || l.topics[3] != bytes32(uint256(uint160(STOA)))) continue;
            (uint24 fee, int24 ts, address hooks,,) = abi.decode(l.data, (uint24, int24, address, uint160, int24));
            key = PoolKey({currency0: address(0), currency1: STOA, fee: fee, tickSpacing: ts, hooks: hooks});
        }
        assertEq(key.hooks, PONS_HOOK, "found the Pons graduation pool");
        console2.log("pool fee / tickSpacing:", key.fee, uint256(int256(key.tickSpacing)));

        assertEq(router.quote(address(0), STOA, 0.01 ether).amountOut, 0, "no route before the pool is registered");
        vm.prank(makeAddr("anyone"));
        v4.register(key);

        (uint256 got,) = _roundTrip(STOA, 0.01 ether);
        console2.log("0.01 ETH -> STOA after graduation:", got / 1e18);
        StoaRouter.Quote memory u = router.quote(USDG, STOA, 10e6);
        assertGt(u.amountOut, 0, "USDG reaches $STOA (through WETH)");
        console2.log("10 USDG -> STOA:", u.amountOut / 1e18);
    }

    /// a Pons launch priced in USDG graduates to a USDG pool with the Pons hook: once registered, it trades from USDG
    /// (ETH buyers swap to USDG first: the router hops only through WETH)
    function test_fork_usdgPairedGraduationRoutesFromUsdg() public {
        if (!on) return vm.skip(true);
        address sic = 0x69156EF2EC33D24EfB29c1a2FA84967BE618cCbF;
        PoolKey memory key = PoolKey({currency0: USDG, currency1: sic, fee: 0, tickSpacing: 200, hooks: PONS_HOOK});
        if (v4.keysFor(USDG, sic).length == 0) {
            assertEq(router.quote(USDG, sic, 10e6).amountOut, 0, "no route before the pool is registered");
            vm.prank(makeAddr("anyone"));
            v4.register(key);
        }
        deal(USDG, alice, 10e6);
        vm.prank(alice);
        IERC20(USDG).approve(address(router), 10e6);
        StoaRouter.Quote memory q = router.quote(USDG, sic, 10e6);
        assertGt(q.amountOut, 0);
        uint256 got = _swapAs(router, alice, USDG, sic, 10e6, q.amountOut, alice, address(0));
        assertEq(got, q.amountOut);
        vm.prank(alice);
        IERC20(sic).approve(address(router), got);
        StoaRouter.Quote memory b = router.quote(sic, USDG, got);
        uint256 back = _swapAs(router, alice, sic, USDG, got, b.amountOut, alice, address(0));
        assertGt(back, 0);
        assertLt(back, 10e6, "a round trip pays the price impact");
        console2.log("10 USDG -> SIC -> USDG:", back);
    }
}

interface IERC20Sym {
    function symbol() external view returns (string memory);
}
