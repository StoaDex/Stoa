// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {UniswapV4Adapter, PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV2} from "../src/adapters/UniswapV4AdapterV2.sol";
import {VenuesRobinhood} from "../script/VenuesRobinhood.sol";

/// @dev A PoolManager that reports every pool as initialized, with liquidity set per test.
contract MockV4PoolManager {
    uint256 public liq = 1;

    function setLiq(uint256 l) external {
        liq = l;
    }

    function extsload(bytes32 slot) external view returns (bytes32) {
        // the adapter reads slot0 (sqrt price) at the pool's state slot and liquidity three slots later
        return slot == bytes32(0) ? bytes32(0) : bytes32(liq | (uint256(1) << 100));
    }
}

/// @notice UniswapV4AdapterV2: only the keeper or the owner may register or remove pool keys.
contract UniswapV4AdapterV2Test is Test {
    MockV4PoolManager pm;
    UniswapV4AdapterV2 v4;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address stranger = makeAddr("stranger");
    address tok = makeAddr("tok");
    address weth = makeAddr("weth");

    function setUp() public {
        pm = new MockV4PoolManager();
        address[] memory hooks = new address[](1);
        v4 = new UniswapV4AdapterV2(IPoolManager(address(pm)), weth, makeAddr("router"), owner, hooks, keeper);
    }

    function _key(uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey(address(0), tok, fee, 60, address(0));
    }

    function test_onlyKeeperOrOwnerRegisters() public {
        vm.prank(stranger);
        vm.expectRevert(UniswapV4AdapterV2.NotKeeper.selector);
        v4.register(_key(100));
        vm.prank(keeper);
        v4.register(_key(100));
        vm.prank(owner);
        v4.register(_key(500));
        assertEq(v4.keysFor(weth, tok).length, 2);
    }

    function test_strangerCannotEvictAFullPair() public {
        for (uint24 i; i < 6; ++i) {
            vm.prank(keeper);
            v4.register(_key(100 + i));
        }
        pm.setLiq(type(uint64).max); // far more in-range liquidity than any listed pool
        vm.prank(stranger);
        vm.expectRevert(UniswapV4AdapterV2.NotKeeper.selector);
        v4.register(_key(3000));
        assertEq(v4.keysFor(weth, tok).length, 6);
    }

    function test_onlyKeeperOrOwnerUnregisters() public {
        vm.prank(keeper);
        v4.register(_key(100));
        vm.prank(stranger);
        vm.expectRevert(UniswapV4AdapterV2.NotKeeper.selector);
        v4.unregister(_key(100));
        vm.prank(keeper);
        v4.unregister(_key(100));
        assertEq(v4.keysFor(weth, tok).length, 0);
    }

    function test_keeperIsSetByTheOwnerOnly() public {
        vm.prank(keeper);
        vm.expectRevert();
        v4.setKeeper(stranger);
        vm.prank(owner);
        v4.setKeeper(address(0)); // turns the role off; the owner still can
        vm.prank(keeper);
        vm.expectRevert(UniswapV4AdapterV2.NotKeeper.selector);
        v4.register(_key(100));
        vm.prank(owner);
        v4.register(_key(100));
    }
}

struct VModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IVPM {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
    function unlock(bytes calldata data) external returns (bytes memory);
    function modifyLiquidity(PoolKey memory key, VModifyLiquidityParams memory params, bytes calldata hookData)
        external
        returns (int256 callerDelta, int256 feesAccrued);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
    function extsload(bytes32 slot) external view returns (bytes32);
}

/// plain V4 liquidity provider, no Stoa role
contract VLp {
    IVPM immutable pm;
    address immutable owner;

    constructor(IVPM pm_) {
        pm = pm_;
        owner = msg.sender;
    }

    receive() external payable {}

    function modify(PoolKey memory key, int24 lo, int24 hi, int256 dl) external {
        pm.unlock(abi.encode(key, lo, hi, dl));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm));
        (PoolKey memory key, int24 lo, int24 hi, int256 dl) = abi.decode(data, (PoolKey, int24, int24, int256));
        (int256 delta,) = pm.modifyLiquidity(key, VModifyLiquidityParams(lo, hi, dl, bytes32(0)), "");
        _settle(key.currency0, int128(delta >> 128));
        _settle(key.currency1, int128(delta));
        return "";
    }

    function _settle(address c, int128 d) private {
        if (d < 0) {
            uint256 amt = uint256(uint128(-d));
            if (c == address(0)) {
                pm.settle{value: amt}();
            } else {
                pm.sync(c);
                IERC20(c).transfer(address(pm), amt);
                pm.settle();
            }
        } else if (d > 0) {
            pm.take(c, owner, uint256(uint128(d)));
        }
    }
}

/// @notice The pool-eviction attack reported by Hey Research Lab (their PoC, reused), against the live router after the
///         timelock swaps the old V4 adapter for UniswapV4AdapterV2 with the same pool keys.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodV4V2 -vv
contract ForkRobinhoodV4V2Test is Test, VenuesRobinhood {
    StoaRouter constant ROUTER = StoaRouter(payable(0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5));
    UniswapV4Adapter constant OLD = UniswapV4Adapter(payable(0x8965140Fb51b2E99a0Cd31a0E99Eae01D36517B8));
    IVPM constant PM = IVPM(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant TIMELOCK = 0xAC75133729d6B5d615aA696d0828dC31fcB83ed8;
    address constant KEEPER = 0xbf666e8D054935170b9f09127247905A975b3B80;
    address constant STOA = 0x13E6993417616De724F2b337D65063f229e96718;
    address constant PONS_V2_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;

    UniswapV4AdapterV2 v2;
    VLp lp;
    address attacker = makeAddr("attacker");
    address user = makeAddr("user");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        v2 = new UniswapV4AdapterV2(IPoolManager(address(PM)), WETH, address(ROUTER), TIMELOCK, v4Hooks(), KEEPER);
        // the keeper copies the old adapter's keys for the pair
        PoolKey[] memory ks = OLD.keysFor(WETH, STOA);
        for (uint256 i; i < ks.length; ++i) {
            vm.prank(KEEPER);
            v2.register(ks[i]);
        }
        vm.prank(attacker);
        lp = new VLp(PM);
        deal(STOA, address(lp), 1e30);
        vm.deal(address(lp), 1000 ether);
    }

    /// the timelock's two steps: add V2 (propose, wait, execute), remove the old adapter
    function _swapAdapters() internal {
        uint256 t = block.timestamp;
        vm.prank(TIMELOCK);
        ROUTER.propose(false, address(v2));
        vm.warp(t + ROUTER.delay() + 1);
        vm.startPrank(TIMELOCK);
        ROUTER.execute(false, address(v2));
        ROUTER.removeAdapter(address(OLD));
        vm.stopPrank();
        vm.warp(t);
    }

    function _q(uint256 a) internal returns (uint256) {
        vm.prank(user, address(0));
        return ROUTER.quote(address(0), STOA, a).amountOut;
    }

    function _slot(PoolKey memory k) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(k)), bytes32(uint256(6))));
    }

    function _floor(int24 t, int24 ts) internal pure returns (int24) {
        int24 r = t / ts;
        if (t < 0 && t % ts != 0) r -= 1;
        return r * ts;
    }

    /// the reporter's lean construction: five narrow fillers and a deep trap at half the real price
    function _plantAll() internal returns (PoolKey[] memory ps) {
        PoolKey memory honest = PoolKey(address(0), STOA, 0, 200, PONS_V2_HOOK);
        uint128 bigL = uint128(uint256(PM.extsload(bytes32(uint256(_slot(honest)) + 3)))) * 3 + 1;
        uint160 badP = uint160(uint256(uint160(uint256(PM.extsload(_slot(honest))))) * 7071 / 10000);
        ps = new PoolKey[](6);
        int24[6] memory sp = [int24(100), 120, 150, 180, 60, 220];
        uint24[6] memory fees = [uint24(101), 102, 103, 104, 3000, 105];
        for (uint256 i; i < 6; ++i) {
            ps[i] = PoolKey(address(0), STOA, fees[i], sp[i], address(0));
            int24 t = PM.initialize(ps[i], badP);
            int24 below = i == 4 ? int24(1200) : int24(0);
            vm.prank(attacker);
            lp.modify(ps[i], _floor(t - below, sp[i]), _floor(t, sp[i]) + sp[i], int256(uint256(bigL)));
        }
    }

    function test_fork_v2_keepsTheRealPool_andRouterPaysTheFairPrice() public {
        if (!on) return vm.skip(true);
        uint256 amt = 0.5 ether;
        uint256 fairOld = _q(amt);
        _swapAdapters();
        assertTrue(ROUTER.isAdapter(address(v2)) && !ROUTER.isAdapter(address(OLD)), "router uses V2 only");
        uint256 fair = _q(amt);
        assertApproxEqRel(fair, fairOld, 0.001e18, "V2 quotes what the old adapter did, from the same pools");

        PoolKey[] memory ps = _plantAll();
        for (uint256 i; i < ps.length; ++i) {
            vm.prank(attacker);
            vm.expectRevert(UniswapV4AdapterV2.NotKeeper.selector);
            v2.register(ps[i]);
            vm.prank(attacker);
            try OLD.register(ps[i]) {} catch {} // the old adapter still accepts them, but the router no longer uses it
        }
        assertEq(_q(amt), fair, "quote unchanged by the planted pools");

        StoaRouter.Quote memory q = ROUTER.quote(address(0), STOA, amt);
        vm.deal(user, amt);
        vm.prank(user);
        uint256 got = ROUTER.swap{value: amt}(
            StoaRouter.SwapParams({
                tokenIn: address(0),
                tokenOut: STOA,
                mid: q.mid,
                leg1: q.leg1,
                leg2: q.leg2,
                amountIn: amt,
                minOut: q.amountOut * 9950 / 10_000,
                to: user,
                deadline: block.timestamp,
                referrer: address(0)
            })
        );
        console2.log("0.5 ETH -> STOA after the attack attempt:", got, " fair:", fair);
        assertGe(got, fair * 9950 / 10_000, "user gets the fair price");
    }
}
