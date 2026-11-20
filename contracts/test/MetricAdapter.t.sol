// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MetricAdapter, IMetricFactory, IMetricQuoter} from "../src/adapters/MetricAdapter.sol";
import {MockToken} from "./mocks/Mocks.sol";

contract MockMetricFactory {
    mapping(address => bool) public isPool;

    function set(address p, bool v) external {
        isPool[p] = v;
    }
}

/// @dev A Metric-like pool: fixed rate out = in * num / den, its own token order, and knobs for the failure modes:
///      `fillBps` < 10_000 fills only part of an exact input; `overAsk` asks the payer for more than it took.
contract MockMetricPool {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint256 public num = 2;
    uint256 public den = 1;
    uint256 public fillBps = 10_000;
    uint256 public overAsk;
    uint256 public swapFillBps = 10_000; // what a real swap fills, which can differ from the quote
    bool public dead; // paused: quotes and swaps revert
    bool public lie; // asks for the whole input, then reports a smaller one
    bool public twice; // asks to be paid twice

    constructor(address f, address t0, address t1) {
        (factory, token0, token1) = (f, t0, t1);
    }

    function setRate(uint256 n, uint256 d) external {
        (num, den) = (n, d);
    }

    function setFill(uint256 bps) external {
        fillBps = bps;
    }

    function setOverAsk(uint256 x) external {
        overAsk = x;
    }

    function setSwapFill(uint256 bps) external {
        swapFillBps = bps;
    }

    function setDead(bool v) external {
        dead = v;
    }

    function setLie(bool v) external {
        lie = v;
    }

    function setTwice(bool v) external {
        twice = v;
    }

    function getImmutables() external view returns (address, address, address, uint256) {
        return (factory, token0, token1, 0);
    }

    function preview(uint256 amountIn) public view returns (uint256 used, uint256 out) {
        require(!dead, "Paused");
        used = amountIn * fillBps / 10_000;
        out = used * num / den;
    }

    function swap(
        address recipient,
        bool zeroForOne,
        int128 amountSpecified,
        uint128,
        bytes calldata cb,
        bytes calldata
    ) external returns (int128, int128) {
        (uint256 used, uint256 out) = preview(uint256(int256(amountSpecified)) * swapFillBps / 10_000);
        IERC20(zeroForOne ? token1 : token0).transfer(recipient, out);
        int256 ask = int256(used + overAsk);
        (int256 a0, int256 a1) = zeroForOne ? (ask, -int256(out)) : (-int256(out), ask);
        _collect(zeroForOne ? token0 : token1, a0, a1, uint256(ask), cb);
        if (twice) MetricAdapter(msg.sender).metricOmmSwapCallback(a0, a1, cb);
        if (lie) (a0, a1) = zeroForOne ? (a0 - 1, a1) : (a0, a1 - 1);
        return (int128(a0), int128(a1));
    }

    function _collect(address tin, int256 a0, int256 a1, uint256 ask, bytes calldata cb) private {
        uint256 before = IERC20(tin).balanceOf(address(this));
        MetricAdapter(msg.sender).metricOmmSwapCallback(a0, a1, cb);
        require(IERC20(tin).balanceOf(address(this)) >= before + ask, "IncorrectDelta");
    }
}

contract MockMetricQuoter {
    function quoteLiveExactInSingle(address pool, address, bool, uint128 amountIn, uint128)
        external
        view
        returns (uint256, uint256)
    {
        return MockMetricPool(pool).preview(amountIn);
    }
}

contract MetricAdapterTest is Test {
    MockMetricFactory factory;
    MockMetricQuoter quoter;
    MetricAdapter metric;
    MockToken a;
    MockToken b;
    MockMetricPool p1;
    MockMetricPool p2;
    address router = makeAddr("router");
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address user = makeAddr("user");

    function setUp() public {
        factory = new MockMetricFactory();
        quoter = new MockMetricQuoter();
        metric =
            new MetricAdapter(IMetricFactory(address(factory)), IMetricQuoter(address(quoter)), router, owner, keeper);
        a = new MockToken("A", 18);
        b = new MockToken("B", 6);
        // p1 keeps the higher address as token0, the way some Metric pools do
        (address hi, address lo) = address(a) > address(b) ? (address(a), address(b)) : (address(b), address(a));
        p1 = new MockMetricPool(address(factory), hi, lo);
        p2 = new MockMetricPool(address(factory), lo, hi);
        p2.setRate(3, 1);
        factory.set(address(p1), true);
        factory.set(address(p2), true);
        a.mint(address(p1), 1e30);
        b.mint(address(p1), 1e30);
        a.mint(address(p2), 1e30);
        b.mint(address(p2), 1e30);
    }

    function _list(address x, address y) internal pure returns (address[] memory l) {
        l = new address[](2);
        (l[0], l[1]) = (x, y);
    }

    function _one(address x) internal pure returns (address[] memory l) {
        l = new address[](1);
        l[0] = x;
    }

    function _setAB(address[] memory pools) internal {
        vm.prank(keeper);
        metric.setPools(address(a), address(b), pools);
    }

    function _swap(address tin, address tout, uint256 amt, uint256 minOut) internal returns (uint256) {
        MockToken(tin).mint(address(metric), amt);
        vm.prank(router);
        return metric.swap(tin, tout, amt, minOut, user);
    }

    function test_quoteAndSwapUseTheFirstPoolThatFills() public {
        _setAB(_list(address(p1), address(p2)));
        assertEq(metric.quote(address(a), address(b), 100), 200, "list order decides, not the rate");
        _setAB(_list(address(p2), address(p1)));
        assertEq(metric.quote(address(a), address(b), 100), 300, "p2 first");
        assertEq(_swap(address(a), address(b), 100, 300), 300, "swap follows the quote");
        assertEq(metric.quote(address(b), address(a), 100), 0, "each direction has its own list");
        assertEq(metric.poolsFor(address(b), address(a)).length, 0);
        assertEq(metric.poolsFor(address(a), address(b))[0], address(p2));
    }

    function test_swapPaysTheRecipientAndKeepsNothing() public {
        _setAB(_one(address(p2)));
        vm.prank(keeper); // the other direction, on a pool with the other token order
        metric.setPools(address(b), address(a), _one(address(p1)));
        uint256 out = _swap(address(a), address(b), 1e18, 3e18);
        assertEq(out, 3e18);
        assertEq(b.balanceOf(user), 3e18);
        assertEq(a.balanceOf(address(metric)), 0, "input fully paid to the pool");
        out = _swap(address(b), address(a), 5e6, 10e6);
        assertEq(a.balanceOf(user), 10e6);
        assertEq(b.balanceOf(address(metric)), 0);
    }

    function test_partialPoolsAreSkipped() public {
        _setAB(_list(address(p2), address(p1)));
        p2.setFill(5000);
        assertEq(metric.quote(address(a), address(b), 100), 200, "p2 fills half: p1 quotes");
        assertEq(_swap(address(a), address(b), 100, 200), 200, "and p1 fills");
        p1.setFill(5000);
        assertEq(metric.quote(address(a), address(b), 100), 0, "partial fills are not quotes");
        a.mint(address(metric), 100);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.NoPath.selector);
        metric.swap(address(a), address(b), 100, 0, user);
    }

    function test_poolThatFillsLessWhenItRunsIsSkipped() public {
        p2.setSwapFill(9000); // quoted in full, fills 90% when it runs
        uint256 p2a = a.balanceOf(address(p2));
        _setAB(_list(address(p2), address(p1)));
        assertEq(metric.quote(address(a), address(b), 100), 300);
        a.mint(address(metric), 100);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.Slippage.selector); // p1 pays 200: the quote's minimum stops it
        metric.swap(address(a), address(b), 100, 300, user);
        assertEq(_swap(address(a), address(b), 100, 0), 200, "without a minimum, p1 fills");
        assertEq(a.balanceOf(address(p2)), p2a, "p2 was never paid");
        _setAB(_one(address(p2)));
        a.mint(address(metric), 100);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.NoPath.selector);
        metric.swap(address(a), address(b), 100, 0, user);
    }

    function test_pausedPoolsAreSkipped() public {
        _setAB(_list(address(p2), address(p1)));
        p2.setDead(true);
        assertEq(metric.quote(address(a), address(b), 100), 200);
        assertEq(_swap(address(a), address(b), 100, 200), 200);
    }

    function test_poolsThatAskForMoreOrTwiceAreNeverPaid() public {
        a.mint(address(metric), 1000); // a stray balance here must not be handed over
        p2.setOverAsk(1);
        _setAB(_one(address(p2)));
        a.mint(address(metric), 100);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.NoPath.selector);
        metric.swap(address(a), address(b), 100, 0, user);
        p2.setOverAsk(0);
        p2.setTwice(true);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.NoPath.selector);
        metric.swap(address(a), address(b), 100, 0, user);
        _setAB(_list(address(p2), address(p1)));
        vm.prank(router);
        assertEq(metric.swap(address(a), address(b), 100, 0, user), 200, "skipped for p1");
        assertEq(a.balanceOf(address(metric)), 1000, "only the input was paid, once");
    }

    function test_poolThatMisreportsItsFillReverts() public {
        _setAB(_list(address(p2), address(p1)));
        p2.setLie(true);
        a.mint(address(metric), 100);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.Partial.selector);
        metric.swap(address(a), address(b), 100, 0, user);
    }

    function test_slippageAndRouterOnly() public {
        _setAB(_one(address(p2)));
        a.mint(address(metric), 100);
        vm.expectRevert(MetricAdapter.OnlyRouter.selector);
        metric.swap(address(a), address(b), 100, 0, user);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.Slippage.selector);
        metric.swap(address(a), address(b), 100, 301, user);
        vm.prank(router);
        vm.expectRevert(MetricAdapter.NoPath.selector);
        metric.swap(address(a), address(b), 0, 0, user);
    }

    function test_callbackOnlyFromThePoolBeingSwapped() public {
        _setAB(_one(address(p2)));
        a.mint(address(metric), 100);
        vm.prank(address(p2)); // a listed pool, but no swap in progress
        vm.expectRevert(MetricAdapter.BadCallback.selector);
        metric.metricOmmSwapCallback(100, -1, "");
        vm.expectRevert(MetricAdapter.BadCallback.selector);
        metric.metricOmmSwapCallback(100, -1, "");
        assertEq(a.balanceOf(address(metric)), 100);
    }

    function test_setPoolsChecks() public {
        vm.prank(user);
        vm.expectRevert(MetricAdapter.NotKeeper.selector);
        metric.setPools(address(a), address(b), _list(address(p1), address(p2)));

        factory.set(address(p2), false);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MetricAdapter.NotMetricPool.selector, address(p2)));
        metric.setPools(address(a), address(b), _list(address(p1), address(p2)));
        factory.set(address(p2), true);

        MockToken c = new MockToken("C", 18);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MetricAdapter.WrongPair.selector, address(p1)));
        metric.setPools(address(a), address(c), _list(address(p1), address(p2)));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MetricAdapter.WrongPair.selector, address(p1)));
        metric.setPools(address(c), address(b), _one(address(p1)));

        vm.prank(keeper);
        vm.expectRevert(MetricAdapter.BadPair.selector);
        metric.setPools(address(a), address(a), _one(address(p1)));
        vm.prank(keeper);
        vm.expectRevert(MetricAdapter.BadPair.selector);
        metric.setPools(address(0), address(b), _one(address(p1)));

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MetricAdapter.Duplicate.selector, address(p1)));
        metric.setPools(address(a), address(b), _list(address(p1), address(p1)));

        address[] memory five = new address[](5);
        vm.prank(owner);
        vm.expectRevert(MetricAdapter.TooMany.selector);
        metric.setPools(address(a), address(b), five);

        _setAB(_list(address(p1), address(p2)));
        vm.prank(owner); // the owner may set lists too, and an empty list turns the direction off
        metric.setPools(address(a), address(b), new address[](0));
        assertEq(metric.quote(address(a), address(b), 100), 0);
    }

    function test_keeperIsSetByTheOwnerOnly() public {
        vm.prank(keeper);
        vm.expectRevert();
        metric.setKeeper(user);
        vm.prank(owner);
        metric.setKeeper(user);
        assertEq(metric.keeper(), user);
        vm.prank(keeper);
        vm.expectRevert(MetricAdapter.NotKeeper.selector);
        metric.setPools(address(a), address(b), _list(address(p1), address(p2)));
    }
}
