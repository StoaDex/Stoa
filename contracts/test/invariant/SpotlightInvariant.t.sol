// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MakerRegistry} from "../../src/MakerRegistry.sol";
import {FeeDistributor} from "../../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../../src/StoaRouter.sol";
import {SpotlightMarket} from "../../src/SpotlightMarket.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2} from "../mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../../src/interfaces/IStoa.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Drives SpotlightMarket with random locks, unlocks, votes, bids, refunds, claims, cancels, settlements,
///      burns, pauses and time. Calls the contract may refuse are wrapped in try/catch.
contract SpotlightHandler is Test {
    uint256 constant M = 1_000_000 ether;

    SpotlightMarket public mkt;
    StoaRouter router;
    MockToken stoa;
    address gov;
    address guardian;
    address keeper;

    address[3] public holders;
    address[3] public projects;
    address[4] public tokens;

    /// @dev ETH claimed so far per (week, token), to check payouts never exceed what the week set aside
    mapping(uint256 => mapping(address => uint256)) public claimedOf;
    uint256 public claimCount;
    /// @dev successful calls, to show the campaign reaches settlement and claims
    uint256 public bids;
    uint256 public finalized;
    uint256 public claims;
    uint256 public refunds;

    constructor(
        SpotlightMarket mkt_,
        StoaRouter router_,
        MockToken stoa_,
        address gov_,
        address guardian_,
        address keeper_
    ) {
        mkt = mkt_;
        router = router_;
        stoa = stoa_;
        gov = gov_;
        guardian = guardian_;
        keeper = keeper_;
        holders = [makeAddr("holder0"), makeAddr("holder1"), makeAddr("holder2")];
        projects = [makeAddr("project0"), makeAddr("project1"), makeAddr("project2")];
        tokens = [makeAddr("tokenA"), makeAddr("tokenB"), makeAddr("tokenC"), makeAddr("tokenD")];
        for (uint256 i; i < 3; ++i) {
            stoa.mint(holders[i], 100 * M);
            vm.prank(holders[i]);
            stoa.approve(address(mkt), type(uint256).max);
            vm.deal(projects[i], 1_000 ether);
        }
    }

    function _epoch() internal view returns (uint256) {
        return mkt.started() ? mkt.currentEpoch() : 0;
    }

    // ------------------------------------------------------------ holders

    function lock(uint256 who, uint256 amount) external {
        vm.prank(holders[who % 3]);
        try mkt.lock(bound(amount, 1, 10 * M)) {} catch {}
    }

    function requestUnlock(uint256 who, uint256 amount) external {
        address h = holders[who % 3];
        uint256 avail = mkt.availableVotes(h);
        if (avail == 0) return;
        vm.prank(h);
        try mkt.requestUnlock(bound(amount, 1, avail)) {} catch {}
    }

    function withdraw(uint256 who) external {
        address h = holders[who % 3];
        vm.prank(h);
        try mkt.withdraw(h) {} catch {}
    }

    function emergencyWithdraw(uint256 who) external {
        address h = holders[who % 3];
        vm.prank(h);
        try mkt.emergencyWithdraw(h) {} catch {}
    }

    /// @dev votes for one or two tokens, splitting up to all of the holder's active $STOA
    function vote(uint256 who, uint256 t1, uint256 t2, uint256 share, uint256 split) external {
        address h = holders[who % 3];
        (uint128 active,,) = mkt.accounts(h);
        if (active == 0) return;
        uint256 total = bound(share, 1, active);
        // mostly vote for tokens already in this week's race, sometimes for any token (the contract must refuse)
        address a = tokens[t1 % 4];
        address b = tokens[t2 % 4];
        if (mkt.started() && share % 4 != 0) {
            (,,, address[] memory list,) = mkt.epochInfo(mkt.currentEpoch());
            if (list.length > 0) {
                a = list[t1 % list.length];
                b = list[t2 % list.length];
            }
        }
        address[] memory ts;
        uint256[] memory amts;
        uint256 first = total * bound(split, 0, 100) / 100;
        if (a == b || first == 0 || first == total) {
            ts = new address[](1);
            amts = new uint256[](1);
            ts[0] = a;
            amts[0] = total;
        } else {
            ts = new address[](2);
            amts = new uint256[](2);
            ts[0] = a;
            ts[1] = b;
            amts[0] = first;
            amts[1] = total - first;
        }
        vm.prank(h);
        try mkt.vote(ts, amts) {} catch {}
    }

    function claim(uint256 who, uint256 e, uint256 t) external {
        address h = holders[who % 3];
        e = bound(e, 0, _epoch());
        // mostly claim a winning token of that week, sometimes any token (the contract must refuse)
        address token = tokens[t % 4];
        (,,,, address[] memory winners) = mkt.epochInfo(e);
        if (winners.length > 0 && t % 4 != 0) token = winners[t % winners.length];
        vm.prank(h);
        try mkt.claim(e, token, h) returns (uint256 amount) {
            claimedOf[e][token] += amount;
            ++claimCount;
            ++claims;
        } catch {}
    }

    // ------------------------------------------------------------ projects

    function bid(uint256 who, uint256 t, uint256 value) external {
        if (!mkt.started()) return;
        uint256 e = mkt.currentEpoch();
        SpotlightMarket.Params memory p = mkt.paramsFor(e);
        // a first bid pays the entry fee on top; top-ups can be small
        value = bound(value, 1, uint256(p.entryFee) * 3 + p.maxBid);
        if (value < mkt.entryFeeFor(e) + p.minBid && (value & 1) == 0) value += mkt.entryFeeFor(e) + p.minBid;
        vm.prank(projects[who % 3]);
        try mkt.bid{value: value}(tokens[t % 4]) {
            ++bids;
        } catch {}
    }

    function refund(uint256 who, uint256 e, uint256 t) external {
        address p = projects[who % 3];
        e = bound(e, 0, _epoch());
        vm.prank(p);
        try mkt.refund(e, tokens[t % 4], p) {
            ++refunds;
        } catch {}
    }

    // ------------------------------------------------------------ anyone, keeper, guardian, time

    function finalize(uint256 e) external {
        if (!mkt.started() || mkt.currentEpoch() == 0) return;
        try mkt.finalize(bound(e, 0, mkt.currentEpoch() - 1)) {
            ++finalized;
        } catch {}
    }

    function cancel(uint256 t) external {
        vm.prank(guardian);
        try mkt.cancel(tokens[t % 4]) {} catch {}
    }

    function burn() external {
        uint256 pot = mkt.burnPot();
        if (pot == 0) return;
        StoaRouter.Quote memory q = router.quote(address(0), address(stoa), pot);
        vm.prank(keeper);
        try mkt.burn(q.mid, q.leg1, q.leg2, 0) {} catch {}
    }

    /// @dev pauses now and then (the guardian), and the next call unpauses (the timelock)
    function togglePause(uint256 seed) external {
        if (mkt.paused()) {
            vm.prank(gov);
            mkt.unpause();
        } else if (seed % 3 == 0) {
            vm.prank(guardian);
            mkt.pause();
        }
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 hours, 4 days));
    }
}

/// @notice SpotlightMarket always holds the burn pot, every refundable or pending bid and every unclaimed payout;
///         its $STOA matches the holders' locks; vote tallies match the votes behind them; no holder votes more
///         than their active $STOA in the week in progress; and every week's winners are valid.
contract SpotlightInvariantTest is StdInvariant, Test {
    uint256 constant M = 1_000_000 ether;

    SpotlightMarket mkt;
    MockToken stoa;
    SpotlightHandler h;
    address gov = makeAddr("gov");
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    StoaRouter router;

    function _deployRouter() internal {
        MockWHYPE weth = new MockWHYPE();
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        FeeDistributor fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        MockAdapter uni = new MockAdapter(1000, 1);
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();
        stoa.mint(address(uni), 1_000_000_000 ether);
    }

    function setUp() public {
        vm.warp(1_790_000_000);
        stoa = new MockToken("STOA", 18);
        _deployRouter();
        SpotlightMarket.Params memory p = SpotlightMarket.Params({
            slots: 2, cutBps: 1000, entryFee: 0.001 ether, minBid: 0.01 ether, maxBid: 0.5 ether, quorum: uint128(M)
        });
        // week 0 starts at once, so every run spans a few settled weeks
        mkt = new SpotlightMarket(gov, router, IERC20(address(stoa)), guardian, keeper, block.timestamp, p);
        h = new SpotlightHandler(mkt, router, stoa, gov, guardian, keeper);
        // every run starts with locked $STOA, so votes can reach the quorum
        h.lock(0, 5 * M);
        h.lock(1, 3 * M);

        targetContract(address(h));
        // bids and votes come up more often than the rest, so most weeks have a race to settle
        bytes4[] memory sel = new bytes4[](20);
        sel[0] = SpotlightHandler.lock.selector;
        sel[1] = SpotlightHandler.requestUnlock.selector;
        sel[2] = SpotlightHandler.withdraw.selector;
        sel[3] = SpotlightHandler.emergencyWithdraw.selector;
        sel[4] = SpotlightHandler.vote.selector;
        sel[5] = SpotlightHandler.vote.selector;
        sel[6] = SpotlightHandler.vote.selector;
        sel[7] = SpotlightHandler.claim.selector;
        sel[8] = SpotlightHandler.claim.selector;
        sel[9] = SpotlightHandler.bid.selector;
        sel[10] = SpotlightHandler.bid.selector;
        sel[11] = SpotlightHandler.bid.selector;
        sel[12] = SpotlightHandler.refund.selector;
        sel[13] = SpotlightHandler.finalize.selector;
        sel[14] = SpotlightHandler.finalize.selector;
        sel[15] = SpotlightHandler.cancel.selector;
        sel[16] = SpotlightHandler.burn.selector;
        sel[17] = SpotlightHandler.togglePause.selector;
        sel[18] = SpotlightHandler.warp.selector;
        sel[19] = SpotlightHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    function _lastEpoch() internal view returns (uint256) {
        return mkt.started() ? mkt.currentEpoch() : 0;
    }

    /// @dev ETH held is exactly the burn pot, plus every bid that is pending or refundable, plus every winning payout
    ///      not claimed yet (claim rounding stays inside the payout, so nothing is left over)
    function invariant_ethCoversEverythingOwed() public view {
        uint256 owed = mkt.burnPot();
        uint256 paid;
        for (uint256 e; e <= _lastEpoch(); ++e) {
            for (uint256 i; i < 4; ++i) {
                address t = h.tokens(i);
                (,, uint128 payout,,,, bool won) = mkt.candidates(e, t);
                if (won) {
                    assertLe(h.claimedOf(e, t), payout, "voters claimed more than the payout");
                    owed += payout - h.claimedOf(e, t);
                    paid += payout;
                } else {
                    for (uint256 p; p < 3; ++p) {
                        owed += mkt.contribution(e, t, h.projects(p));
                    }
                }
            }
        }
        assertEq(address(mkt).balance, owed, "ETH held != ETH owed");
        assertEq(mkt.totalPaidToVoters(), paid, "totalPaidToVoters");
    }

    function invariant_stoaMatchesHolders() public view {
        uint256 locked;
        for (uint256 i; i < 3; ++i) {
            (uint128 a, uint128 p,) = mkt.accounts(h.holders(i));
            locked += uint256(a) + p;
        }
        assertEq(mkt.totalLocked(), locked, "totalLocked");
        assertEq(stoa.balanceOf(address(mkt)), locked, "STOA held != STOA locked");
    }

    /// @dev tallies are the sum of the votes behind them, and in the week in progress nobody votes more than their
    ///      active $STOA, so the same $STOA never counts twice
    function invariant_votesAddUp() public view {
        uint256 last = _lastEpoch();
        for (uint256 e; e <= last; ++e) {
            uint256[3] memory used;
            for (uint256 i; i < 4; ++i) {
                address t = h.tokens(i);
                (, uint128 votes,,,,,) = mkt.candidates(e, t);
                uint256 sum;
                for (uint256 k; k < 3; ++k) {
                    uint256 v = mkt.votesOf(e, t, h.holders(k));
                    sum += v;
                    used[k] += v;
                }
                assertEq(votes, sum, "tally != votes behind it");
            }
            for (uint256 k; k < 3; ++k) {
                address holder = h.holders(k);
                assertEq(mkt.usedVotes(e, holder), used[k], "usedVotes");
                if (e == last && mkt.started()) {
                    (uint128 active,,) = mkt.accounts(holder);
                    assertLe(used[k], active, "votes above active STOA in the week in progress");
                }
            }
        }
    }

    /// @dev winners are at most `slots`, not canceled, at the quorum, and outbid nobody who lost while eligible
    function invariant_winnersAreValid() public view {
        for (uint256 e; e <= _lastEpoch(); ++e) {
            (SpotlightMarket.Params memory p,, bool fin,, address[] memory winners) = mkt.epochInfo(e);
            if (!fin) {
                assertEq(winners.length, 0, "winners before settlement");
                continue;
            }
            assertLe(winners.length, p.slots, "more winners than slots");
            uint256 lowest = type(uint256).max;
            for (uint256 w; w < winners.length; ++w) {
                (uint128 pot, uint128 votes,,,, bool canceled, bool won) = mkt.candidates(e, winners[w]);
                assertTrue(won && !canceled, "winner canceled or not marked");
                assertGe(votes, p.quorum, "winner below quorum");
                if (pot < lowest) lowest = pot;
            }
            if (winners.length < p.slots) lowest = 0;
            for (uint256 i; i < 4; ++i) {
                (uint128 pot, uint128 votes,,, bool listed, bool canceled, bool won) = mkt.candidates(e, h.tokens(i));
                if (!listed || won || canceled || votes < p.quorum) continue;
                assertLe(pot, lowest, "an eligible loser bid more than a winner");
            }
        }
    }
}
