// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {SpotlightMarket} from "../src/SpotlightMarket.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2} from "./mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev receives ETH and tries to claim a second time while being paid
contract ReentrantVoter {
    SpotlightMarket m;
    uint256 epoch;
    address token;
    bool tried;

    constructor(SpotlightMarket m_) {
        m = m_;
    }

    function setup(IERC20 stoa, uint256 amt) external {
        stoa.approve(address(m), amt);
        m.lock(amt);
    }

    function voteFor(address t, uint256 amt) external {
        address[] memory ts = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ts[0] = t;
        as_[0] = amt;
        m.vote(ts, as_);
    }

    function claimTwice(uint256 e, address t) external {
        epoch = e;
        token = t;
        m.claim(e, t, address(this));
    }

    receive() external payable {
        if (!tried) {
            tried = true;
            m.claim(epoch, token, address(this));
        }
    }
}

/// @dev a contract that refuses ETH: it must still be able to claim to another address
contract NoEthVoter {
    SpotlightMarket m;

    constructor(SpotlightMarket m_) {
        m = m_;
    }

    function setup(IERC20 stoa, uint256 amt) external {
        stoa.approve(address(m), amt);
        m.lock(amt);
    }

    function voteFor(address t, uint256 amt) external {
        address[] memory ts = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ts[0] = t;
        as_[0] = amt;
        m.vote(ts, as_);
    }

    function claimTo(uint256 e, address t, address to) external returns (uint256) {
        return m.claim(e, t, to);
    }
}

contract SpotlightTest is Test {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    uint256 constant M = 1_000_000 ether; // 1M STOA

    SpotlightMarket mkt;
    StoaRouter router;
    FeeDistributor fees;
    MockWHYPE weth;
    MockToken stoa;
    MockAdapter uni;

    address gov = makeAddr("gov"); // the timelock
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address h1 = makeAddr("h1");
    address h2 = makeAddr("h2");
    address h3 = makeAddr("h3");
    address p1 = makeAddr("p1");
    address p2 = makeAddr("p2");
    address p3 = makeAddr("p3");
    address p4 = makeAddr("p4");
    address stranger = makeAddr("stranger");

    address tA = makeAddr("tokenA");
    address tB = makeAddr("tokenB");
    address tC = makeAddr("tokenC");
    address tD = makeAddr("tokenD");

    uint256 start;

    function _p() internal pure returns (SpotlightMarket.Params memory) {
        return SpotlightMarket.Params({
            slots: 3, cutBps: 1000, entryFee: 0.001 ether, minBid: 0.01 ether, maxBid: 0.5 ether, quorum: uint128(M)
        });
    }

    function setUp() public {
        vm.warp(1_790_000_000);
        weth = new MockWHYPE();
        stoa = new MockToken("STOA", 18);
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        uni = new MockAdapter(1000, 1); // 1 ETH -> 1000 STOA
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();
        stoa.mint(address(uni), 1_000_000_000 ether);

        start = block.timestamp + 1 days;
        mkt = new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, _p());

        address[3] memory hs = [h1, h2, h3];
        for (uint256 i; i < 3; ++i) {
            stoa.mint(hs[i], 100 * M);
            vm.prank(hs[i]);
            stoa.approve(address(mkt), type(uint256).max);
        }
        address[5] memory ps = [p1, p2, p3, p4, stranger];
        for (uint256 i; i < 5; ++i) {
            vm.deal(ps[i], 100 ether);
        }
    }

    // ------------------------------------------------------------ helpers

    function _at(uint256 epoch, uint256 offset) internal {
        vm.warp(start + epoch * 7 days + offset);
    }

    function _lock(address who, uint256 amt) internal {
        vm.prank(who);
        mkt.lock(amt);
    }

    function _bid(address who, address token, uint256 value) internal {
        vm.prank(who);
        mkt.bid{value: value}(token);
    }

    function _vote1(address who, address t, uint256 amt) internal {
        address[] memory ts = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ts[0] = t;
        as_[0] = amt;
        vm.prank(who);
        mkt.vote(ts, as_);
    }

    function _vote2(address who, address t1, uint256 a1, address t2, uint256 a2) internal {
        address[] memory ts = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ts[0] = t1;
        ts[1] = t2;
        as_[0] = a1;
        as_[1] = a2;
        vm.prank(who);
        mkt.vote(ts, as_);
    }

    function _burn(uint256 minOut) internal returns (uint256) {
        StoaRouter.Quote memory q = router.quote(address(0), address(stoa), mkt.burnPot());
        vm.prank(keeper);
        return mkt.burn(q.mid, q.leg1, q.leg2, minOut);
    }

    // ------------------------------------------------------------ setup

    function test_constructorAndBounds() public {
        SpotlightMarket.Params memory p = _p();
        p.slots = 0;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        p = _p();
        p.slots = 6;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        p = _p();
        p.cutBps = 2001;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        p = _p();
        p.entryFee = 0.011 ether;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        p = _p();
        p.minBid = 0;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        p = _p();
        p.maxBid = 0.001 ether;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        p = _p();
        p.quorum = 0;
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, start, p);
        vm.expectRevert(SpotlightMarket.ZeroAddress.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), address(0), keeper, start, _p());
        vm.expectRevert(SpotlightMarket.ZeroAddress.selector);
        new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, address(0), start, _p());
        vm.prank(gov);
        vm.expectRevert(SpotlightMarket.ZeroAddress.selector);
        mkt.setGuardian(address(0));
        assertEq(mkt.owner(), gov);
        assertEq(mkt.guardian(), guardian);
        assertEq(mkt.keeper(), keeper);
    }

    function test_beforeStart_lockOnly() public {
        _lock(h1, M);
        assertEq(mkt.availableVotes(h1), M);
        vm.expectRevert(SpotlightMarket.NotStarted.selector);
        _bid(p1, tA, 0.02 ether);
        vm.expectRevert(SpotlightMarket.NotStarted.selector);
        _vote1(h1, tA, M);
        // unlocking before the start matures at the start
        vm.prank(h1);
        mkt.requestUnlock(M);
        (,, uint64 unlockAt) = mkt.accounts(h1);
        assertEq(unlockAt, start);
    }

    function test_directEthRejected() public {
        vm.prank(p1);
        (bool ok,) = address(mkt).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------ a full week

    function test_fullWeek() public {
        _lock(h1, 10 * M);
        _lock(h2, 5 * M);
        _lock(h3, 2 * M);
        _at(0, 1 hours);
        _bid(p1, tA, 0.201 ether); // 0.2 after the entry fee
        _bid(p2, tB, 0.101 ether); // 0.1
        _bid(p3, tC, 0.051 ether); // 0.05
        _bid(p4, tD, 0.301 ether); // 0.3, but nobody votes for it
        _vote2(h1, tA, 6 * M, tB, 4 * M);
        _vote1(h2, tA, 2 * M);
        _vote1(h3, tC, 2 * M);
        assertEq(mkt.burnPot(), 0.004 ether, "entry fees");

        vm.expectRevert(SpotlightMarket.EpochNotOver.selector);
        mkt.finalize(0);
        _at(1, 0);
        address[] memory w = mkt.finalize(0);
        assertEq(w.length, 3);
        assertEq(w[0], tA);
        assertEq(w[1], tB);
        assertEq(w[2], tC);
        vm.expectRevert(SpotlightMarket.AlreadyFinalized.selector);
        mkt.finalize(0);

        // 10% of 0.35 ETH to the burn pot, 90% to voters
        assertEq(mkt.burnPot(), 0.004 ether + 0.035 ether);
        assertEq(mkt.totalPaidToVoters(), 0.315 ether);
        // tA: 0.18 to voters, h1 6M of 8M, h2 2M of 8M
        assertEq(mkt.claimable(0, tA, h1), 0.135 ether);
        assertEq(mkt.claimable(0, tA, h2), 0.045 ether);
        assertEq(mkt.claimable(0, tB, h1), 0.09 ether);
        assertEq(mkt.claimable(0, tC, h3), 0.045 ether);
        assertEq(mkt.refundable(0, tD, p4), 0.3 ether, "no quorum: refunded");
        assertEq(mkt.refundable(0, tA, p1), 0, "winner not refundable");

        uint256 b1 = h1.balance;
        uint256[] memory es = new uint256[](2);
        address[] memory ts = new address[](2);
        ts[0] = tA;
        ts[1] = tB;
        vm.prank(h1);
        mkt.claimMany(es, ts, h1);
        assertEq(h1.balance - b1, 0.225 ether);
        vm.prank(h2);
        mkt.claim(0, tA, h2);
        vm.prank(h3);
        mkt.claim(0, tC, h3);
        vm.prank(p4);
        mkt.refund(0, tD, p4);

        uint256 burned = _burn(1);
        assertEq(burned, stoa.balanceOf(BURN));
        assertEq(mkt.totalBurned(), burned);
        assertEq(mkt.burnPot(), 0);
        assertEq(address(mkt).balance, 0, "every wei accounted for");
    }

    function test_rankedByEthNotVotes() public {
        _lock(h1, 50 * M);
        _lock(h2, 2 * M);
        _at(0, 0);
        SpotlightMarket.Params memory p = _p();
        p.slots = 1;
        vm.prank(gov);
        mkt.setParams(p); // applies from week 1
        _at(1, 0);
        _bid(p1, tA, 0.051 ether);
        _bid(p2, tB, 0.101 ether);
        _vote1(h1, tA, 50 * M); // many votes, small bid
        _vote1(h2, tB, 2 * M); // few votes (above quorum), larger bid
        _at(2, 0);
        address[] memory w = mkt.finalize(1);
        assertEq(w.length, 1);
        assertEq(w[0], tB);
        assertEq(mkt.refundable(1, tA, p1), 0.05 ether);
    }

    function test_quorumRequired() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.401 ether);
        _bid(p2, tB, 0.011 ether);
        _vote2(h1, tA, M - 1, tB, M);
        _at(1, 0);
        address[] memory w = mkt.finalize(0);
        assertEq(w.length, 1);
        assertEq(w[0], tB);
        assertEq(mkt.refundable(0, tA, p1), 0.4 ether);
    }

    function test_tieGoesToEarlierEntrant() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        SpotlightMarket.Params memory p = _p();
        p.slots = 1;
        vm.prank(gov);
        mkt.setParams(p);
        _at(1, 0);
        _bid(p1, tA, 0.101 ether);
        _bid(p2, tB, 0.101 ether);
        _vote2(h1, tA, M, tB, 5 * M);
        _at(2, 0);
        address[] memory w = mkt.finalize(1);
        assertEq(w[0], tA);
    }

    function test_moreThanSlotsSortedCorrectly() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        address[6] memory ts =
            [makeAddr("t1"), makeAddr("t2"), makeAddr("t3"), makeAddr("t4"), makeAddr("t5"), makeAddr("t6")];
        uint256[6] memory amts = [uint256(0.02 ether), 0.4 ether, 0.1 ether, 0.3 ether, 0.05 ether, 0.4 ether];
        address[] memory vts = new address[](6);
        uint256[] memory vas = new uint256[](6);
        for (uint256 i; i < 6; ++i) {
            _bid(p1, ts[i], amts[i] + 0.001 ether);
            vts[i] = ts[i];
            vas[i] = M;
        }
        vm.prank(h1);
        mkt.vote(vts, vas);
        _at(1, 0);
        address[] memory w = mkt.finalize(0);
        assertEq(w.length, 3);
        assertEq(w[0], ts[1], "0.4 entered first");
        assertEq(w[1], ts[5], "0.4 entered later");
        assertEq(w[2], ts[3], "0.3");
    }

    // ------------------------------------------------------------ attacks the rules close

    /// a project that locks STOA and votes for itself still shares with every other voter of its token
    function test_selfVotingProjectShares() public {
        stoa.mint(p1, 20 * M);
        vm.startPrank(p1);
        stoa.approve(address(mkt), type(uint256).max);
        mkt.lock(20 * M);
        vm.stopPrank();
        _lock(h1, 20 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _vote1(p1, tA, 20 * M);
        _vote1(h1, tA, 20 * M);
        _at(1, 0);
        mkt.finalize(0);
        assertEq(mkt.claimable(0, tA, p1), 0.045 ether);
        assertEq(mkt.claimable(0, tA, h1), 0.045 ether, "outside holders get half");
    }

    /// bids freeze after five days: no last-second top-up can flip the ranking
    function test_bidsFreezeLastTwoDays() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _at(0, 5 days - 1);
        _bid(p1, tA, 0.01 ether);
        _at(0, 5 days);
        vm.expectRevert(SpotlightMarket.BiddingClosed.selector);
        _bid(p1, tA, 0.01 ether);
        vm.expectRevert(SpotlightMarket.BiddingClosed.selector);
        _bid(p2, tB, 0.5 ether);
        _at(0, 7 days - 1);
        _vote1(h1, tA, M); // votes still open
        (uint128 pot,,,,,,) = mkt.candidates(0, tA);
        assertEq(pot, 0.11 ether);
    }

    /// STOA that voted this week cannot leave before the end of next week (about 7 days minimum)
    function test_mercenaryLockStaysAWeek() public {
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        // ten seconds before the week closes: lock and vote
        _at(0, 7 days - 10);
        _lock(h1, 10 * M);
        _vote1(h1, tA, 10 * M);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.InsufficientUnlocked.selector);
        mkt.requestUnlock(1);
        _at(1, 0);
        vm.prank(h1);
        mkt.requestUnlock(10 * M);
        (, uint128 pending, uint64 unlockAt) = mkt.accounts(h1);
        assertEq(pending, 10 * M);
        assertEq(unlockAt, start + 14 days);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.StillLocked.selector);
        mkt.withdraw(h1);
        _at(2, 0);
        vm.prank(h1);
        mkt.withdraw(h1);
        assertEq(stoa.balanceOf(h1), 100 * M);
    }

    /// pending STOA does not vote, and the same STOA can never be counted twice in one week
    function test_noDoubleCounting() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        vm.prank(h1);
        mkt.requestUnlock(4 * M);
        assertEq(mkt.availableVotes(h1), 6 * M);
        address[] memory ts = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ts[0] = tA;
        as_[0] = 7 * M;
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.NotEnoughPower.selector);
        mkt.vote(ts, as_);
        _vote1(h1, tA, 6 * M);
        _vote1(h1, tA, 3 * M); // replacing, not adding
        (, uint128 votes,,,,,) = mkt.candidates(0, tA);
        assertEq(votes, 3 * M);
        assertEq(mkt.usedVotes(0, h1), 3 * M);
    }

    /// filling the week with spam gets expensive fast, and the guardian frees places by canceling
    function test_spamCandidatesCostGrowingFeesAndCap() public {
        _at(0, 0);
        vm.deal(stranger, 100 ether);
        assertEq(mkt.entryFeeFor(0), 0.001 ether);
        for (uint256 i; i < 100; ++i) {
            _bid(stranger, address(uint160(0x1000 + i)), mkt.entryFeeFor(0) + 0.01 ether);
        }
        // 20 tokens at each step: 1x, 2x, 3x, 4x, 5x the base fee
        assertEq(mkt.burnPot(), 0.3 ether, "spam fees go to the burn");
        assertEq(mkt.entryFeeFor(0), 0.006 ether);
        uint256 fee = mkt.entryFeeFor(0);
        vm.expectRevert(SpotlightMarket.TooManyCandidates.selector);
        _bid(p1, tA, fee + 0.01 ether);
        // the guardian cancels one: its place frees up for a real project
        vm.prank(guardian);
        mkt.cancel(address(uint160(0x1000)));
        vm.expectRevert(SpotlightMarket.BidTooSmall.selector);
        _bid(p1, tA, fee + 0.01 ether - 1);
        _bid(p1, tA, fee + 0.01 ether);
        (uint128 pot,,,,,,) = mkt.candidates(0, tA);
        assertEq(pot, 0.01 ether);
        // bids are refundable, entry fees are not
        uint256 b = stranger.balance;
        vm.prank(stranger);
        mkt.refund(0, address(uint160(0x1000)), stranger);
        assertEq(stranger.balance - b, 0.01 ether);
    }

    /// the hard cap of 255 entries a week keeps `finalize` cheap whatever happens
    function test_listedCapBoundsFinalize() public {
        _lock(h1, 100 * M);
        _at(0, 0);
        vm.deal(stranger, 1000 ether);
        for (uint256 i; i < 255; ++i) {
            address t = address(uint160(0x2000 + i));
            _bid(stranger, t, mkt.entryFeeFor(0) + 0.01 ether + i * 1 gwei);
            if (i >= 90) {
                vm.prank(guardian);
                mkt.cancel(t);
            }
        }
        (,,, address[] memory list,) = mkt.epochInfo(0);
        assertEq(list.length, 255);
        uint256 fee = mkt.entryFeeFor(0);
        vm.expectRevert(SpotlightMarket.TooManyCandidates.selector);
        _bid(p1, tA, fee + 0.01 ether);
        address[] memory ts = new address[](10);
        uint256[] memory as_ = new uint256[](10);
        for (uint256 i; i < 10; ++i) {
            ts[i] = address(uint160(0x2000 + 80 + i));
            as_[i] = M;
        }
        vm.prank(h1);
        mkt.vote(ts, as_);
        _at(1, 0);
        uint256 g = gasleft();
        address[] memory w = mkt.finalize(0);
        uint256 used = g - gasleft();
        assertLt(used, 3_000_000, "finalize stays cheap at the cap");
        assertEq(w[0], address(uint160(0x2000 + 89)), "largest bid among eligible");
    }

    function test_bidRules() public {
        _at(0, 0);
        vm.expectRevert(SpotlightMarket.BidTooSmall.selector);
        _bid(p1, tA, 0.0109 ether);
        vm.expectRevert(SpotlightMarket.BadToken.selector);
        _bid(p1, address(stoa), 0.02 ether);
        vm.expectRevert(SpotlightMarket.BadToken.selector);
        _bid(p1, address(0), 0.02 ether);
        _bid(p1, tA, 0.011 ether);
        _bid(p2, tA, 1 wei); // anyone can add, any amount
        vm.expectRevert(SpotlightMarket.ZeroAmount.selector);
        _bid(p2, tA, 0);
        vm.expectRevert(SpotlightMarket.BidTooLarge.selector);
        _bid(p3, tA, 0.49 ether);
        _bid(p3, tA, 0.49 ether - 1);
        (uint128 pot,,,,,,) = mkt.candidates(0, tA);
        assertEq(pot, 0.5 ether);
        assertEq(mkt.contribution(0, tA, p2), 1);
    }

    function test_voteRules() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.011 ether);
        _bid(p1, tB, 0.011 ether);
        vm.expectRevert(SpotlightMarket.NotCandidate.selector);
        _vote1(h1, tC, M);
        vm.expectRevert(SpotlightMarket.DuplicateToken.selector);
        _vote2(h1, tA, M, tA, M);
        vm.expectRevert(SpotlightMarket.ZeroAmount.selector);
        _vote1(h1, tA, 0);
        address[] memory ts = new address[](11);
        uint256[] memory as_ = new uint256[](11);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.TooManyVotes.selector);
        mkt.vote(ts, as_);
        _vote2(h1, tA, 3 * M, tB, 2 * M);
        // empty arrays clear the week's votes
        vm.prank(h1);
        mkt.vote(new address[](0), new uint256[](0));
        (, uint128 va,,,,,) = mkt.candidates(0, tA);
        (, uint128 vb,,,,,) = mkt.candidates(0, tB);
        assertEq(va + vb, 0);
        assertEq(mkt.votedTokens(0, h1).length, 0);
        vm.prank(guardian);
        mkt.cancel(tB);
        vm.expectRevert(SpotlightMarket.Canceled_.selector);
        _vote1(h1, tB, M);
        vm.expectRevert(SpotlightMarket.Canceled_.selector);
        _bid(p2, tB, 0.02 ether);
    }

    function test_cancelRules() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _vote1(h1, tA, 5 * M);
        vm.prank(stranger);
        vm.expectRevert(SpotlightMarket.NotGuardian.selector);
        mkt.cancel(tA);
        vm.prank(guardian);
        vm.expectRevert(SpotlightMarket.NotCandidate.selector);
        mkt.cancel(tB);
        _at(0, 5 days);
        vm.prank(guardian);
        vm.expectRevert(SpotlightMarket.BiddingClosed.selector);
        mkt.cancel(tA);
        _at(0, 4 days);
        vm.prank(guardian);
        mkt.cancel(tA);
        // refundable at once, in full, and never a winner even with votes
        vm.prank(p1);
        mkt.refund(0, tA, p1);
        _at(1, 0);
        address[] memory w = mkt.finalize(0);
        assertEq(w.length, 0);
        vm.prank(p1);
        vm.expectRevert(SpotlightMarket.NothingToClaim.selector);
        mkt.refund(0, tA, p1);
    }

    function test_refundAndClaimRules() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _bid(p2, tB, 0.051 ether);
        _vote1(h1, tA, 5 * M);
        vm.prank(p2);
        vm.expectRevert(SpotlightMarket.NotRefundable.selector);
        mkt.refund(0, tB, p2);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.NotFinalized.selector);
        mkt.claim(0, tA, h1);
        _at(1, 0);
        mkt.finalize(0);
        vm.prank(p1);
        vm.expectRevert(SpotlightMarket.NotRefundable.selector);
        mkt.refund(0, tA, p1);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.NotWinner.selector);
        mkt.claim(0, tB, h1);
        vm.prank(h2);
        vm.expectRevert(SpotlightMarket.NothingToClaim.selector);
        mkt.claim(0, tA, h2);
        vm.prank(h1);
        mkt.claim(0, tA, h1);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.NothingToClaim.selector);
        mkt.claim(0, tA, h1);
        vm.prank(p2);
        mkt.refund(0, tB, p2);
        vm.prank(p2);
        vm.expectRevert(SpotlightMarket.NothingToClaim.selector);
        mkt.refund(0, tB, p2);
    }

    function test_reentrantClaimFails() public {
        ReentrantVoter r = new ReentrantVoter(mkt);
        stoa.mint(address(r), 10 * M);
        r.setup(IERC20(address(stoa)), 10 * M);
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        r.voteFor(tA, 10 * M);
        _vote1(h1, tA, 10 * M);
        _at(1, 0);
        mkt.finalize(0);
        vm.expectRevert(SpotlightMarket.TransferFailed.selector);
        r.claimTwice(0, tA);
        assertEq(address(r).balance, 0);
        assertFalse(mkt.claimed(0, tA, address(r)));
    }

    function test_contractVoterClaimsToAnotherAddress() public {
        NoEthVoter v = new NoEthVoter(mkt);
        stoa.mint(address(v), 10 * M);
        v.setup(IERC20(address(stoa)), 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        v.voteFor(tA, 10 * M);
        _at(1, 0);
        mkt.finalize(0);
        assertEq(v.claimTo(0, tA, h3), 0.09 ether);
    }

    // ------------------------------------------------------------ pause and emergencies

    function test_pauseStopsNewActivityOnly() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _bid(p2, tB, 0.051 ether);
        _vote1(h1, tA, 5 * M);
        vm.prank(stranger);
        vm.expectRevert(SpotlightMarket.NotGuardian.selector);
        mkt.pause();
        vm.prank(guardian);
        mkt.pause();
        vm.expectRevert(SpotlightMarket.IsPaused.selector);
        _lock(h2, M);
        vm.expectRevert(SpotlightMarket.IsPaused.selector);
        _bid(p3, tC, 0.02 ether);
        vm.expectRevert(SpotlightMarket.IsPaused.selector);
        _vote1(h1, tB, M);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        mkt.unpause();
        // settlement and exits keep working
        _at(1, 0);
        mkt.finalize(0);
        vm.prank(h1);
        mkt.claim(0, tA, h1);
        vm.prank(p2);
        mkt.refund(0, tB, p2);
        vm.prank(gov);
        mkt.unpause();
        assertFalse(mkt.paused());
    }

    function test_emergencyWithdrawClearsThisWeeksVotes() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _vote1(h1, tA, 10 * M);
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.NotPausedNow.selector);
        mkt.emergencyWithdraw(h1);
        vm.prank(guardian);
        mkt.pause();
        vm.prank(h1);
        mkt.emergencyWithdraw(h1);
        assertEq(stoa.balanceOf(h1), 100 * M);
        (, uint128 votes,,,,,) = mkt.candidates(0, tA);
        assertEq(votes, 0, "its votes left with it");
        // the same STOA, moved to someone else, counts once
        vm.prank(h1);
        stoa.transfer(h2, 10 * M);
        vm.prank(gov);
        mkt.unpause();
        _lock(h2, 10 * M);
        _vote1(h2, tA, 10 * M);
        (, votes,,,,,) = mkt.candidates(0, tA);
        assertEq(votes, 10 * M);
        assertEq(mkt.totalLocked(), 10 * M);
    }

    function test_emergencyWithdrawKeepsEndedWeeks() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        _bid(p1, tA, 0.101 ether);
        _vote1(h1, tA, 10 * M);
        _at(1, 0);
        vm.prank(guardian);
        mkt.pause();
        vm.prank(h1);
        mkt.emergencyWithdraw(h1);
        mkt.finalize(0);
        assertEq(mkt.claimable(0, tA, h1), 0.09 ether, "week 0 was fully locked: still paid");
    }

    // ------------------------------------------------------------ parameters

    function test_paramsApplyFromNextWeek() public {
        _at(0, 0);
        SpotlightMarket.Params memory p = _p();
        p.slots = 1;
        p.cutBps = 2000;
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        mkt.setParams(p);
        vm.prank(gov);
        mkt.setParams(p); // week 0 has no bid yet, and still keeps the old rules
        assertEq(mkt.paramsFor(0).slots, 3);
        assertEq(mkt.paramsFor(1).slots, 1);
        _bid(p1, tA, 0.011 ether);
        (SpotlightMarket.Params memory e0,,,,) = mkt.epochInfo(0);
        assertEq(e0.cutBps, 1000);
        // a later change while week 1 runs leaves week 1 alone and rolls week 1's rules forward
        _at(1, 0);
        _bid(p1, tA, 0.011 ether);
        p.slots = 2;
        vm.prank(gov);
        mkt.setParams(p);
        assertEq(mkt.paramsFor(1).slots, 1);
        assertEq(mkt.paramsFor(2).slots, 2);
        assertEq(mkt.paramsFor(1).cutBps, 2000);
        p.cutBps = 2001;
        vm.prank(gov);
        vm.expectRevert(SpotlightMarket.BadParams.selector);
        mkt.setParams(p);
    }

    function test_ownerSetsRoles() public {
        vm.startPrank(gov);
        mkt.setGuardian(h3);
        mkt.setKeeper(h2);
        vm.stopPrank();
        assertEq(mkt.guardian(), h3);
        assertEq(mkt.keeper(), h2);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        mkt.setKeeper(stranger);
    }

    // ------------------------------------------------------------ burn

    function test_burnOnlyKeeperAndBoundedByMinOut() public {
        _at(0, 0);
        _bid(p1, tA, 0.011 ether);
        StoaRouter.Quote memory q = router.quote(address(0), address(stoa), mkt.burnPot());
        vm.prank(stranger);
        vm.expectRevert(SpotlightMarket.NotKeeper.selector);
        mkt.burn(q.mid, q.leg1, q.leg2, 0);
        vm.prank(keeper);
        vm.expectRevert();
        mkt.burn(q.mid, q.leg1, q.leg2, q.amountOut + 1);
        assertEq(mkt.burnPot(), 0.001 ether, "pot kept when the swap fails");
        uint256 burned = _burn(q.amountOut);
        assertEq(burned, q.amountOut);
        assertEq(stoa.balanceOf(BURN), burned);
        vm.prank(keeper);
        vm.expectRevert(SpotlightMarket.ZeroAmount.selector);
        mkt.burn(q.mid, q.leg1, q.leg2, 0);
    }

    // ------------------------------------------------------------ locking

    function test_requestUnlockPaysMaturedFirst() public {
        _lock(h1, 10 * M);
        _at(0, 0);
        vm.prank(h1);
        mkt.requestUnlock(2 * M);
        _at(1, 0);
        vm.prank(h1);
        mkt.requestUnlock(3 * M);
        (uint128 active, uint128 pending,) = mkt.accounts(h1);
        assertEq(active, 5 * M);
        assertEq(pending, 3 * M);
        assertEq(stoa.balanceOf(h1), 92 * M);
        assertEq(mkt.totalLocked(), 8 * M);
    }

    function test_lockRejectsZeroAndEmptyFinalize() public {
        vm.prank(h1);
        vm.expectRevert(SpotlightMarket.ZeroAmount.selector);
        mkt.lock(0);
        _at(1, 0);
        address[] memory w = mkt.finalize(0);
        assertEq(w.length, 0);
        (,, bool fin,,) = mkt.epochInfo(0);
        assertTrue(fin);
    }

    // ------------------------------------------------------------ conservation

    /// whatever the bids and votes, every wei that comes in leaves to a voter, a bidder or the burn,
    /// and nobody gets more than the pot (rounding dust stays behind, a few wei at most)
    function testFuzz_ethConserved(uint96[4] memory bids, uint64[3] memory va, uint64[3] memory vb) public {
        address[4] memory ts = [tA, tB, tC, tD];
        address[3] memory hs = [h1, h2, h3];
        for (uint256 i; i < 3; ++i) {
            _lock(hs[i], 100 * M);
        }
        _at(0, 0);
        uint256 inTotal;
        for (uint256 i; i < 4; ++i) {
            uint256 b = bound(uint256(bids[i]), 0.01 ether, 0.5 ether);
            _bid(p1, ts[i], b + 0.001 ether);
            inTotal += b + 0.001 ether;
        }
        for (uint256 i; i < 3; ++i) {
            uint256 a = bound(uint256(va[i]), 0, 50) * M;
            uint256 c = bound(uint256(vb[i]), 0, 50) * M;
            address t1 = ts[i];
            address t2 = ts[i + 1];
            if (a > 0 && c > 0) _vote2(hs[i], t1, a, t2, c);
            else if (a > 0) _vote1(hs[i], t1, a);
            else if (c > 0) _vote1(hs[i], t2, c);
        }
        _at(1, 0);
        mkt.finalize(0);
        uint256 out;
        for (uint256 i; i < 4; ++i) {
            for (uint256 j; j < 3; ++j) {
                uint256 c = mkt.claimable(0, ts[i], hs[j]);
                if (c > 0) {
                    vm.prank(hs[j]);
                    out += mkt.claim(0, ts[i], hs[j]);
                }
            }
            uint256 r = mkt.refundable(0, ts[i], p1);
            if (r > 0) {
                vm.prank(p1);
                out += mkt.refund(0, ts[i], p1);
            }
        }
        out += mkt.burnPot();
        assertLe(out, inTotal);
        assertLe(inTotal - out, 12, "dust only");
        assertEq(address(mkt).balance, inTotal - (out - mkt.burnPot()));
    }
}
