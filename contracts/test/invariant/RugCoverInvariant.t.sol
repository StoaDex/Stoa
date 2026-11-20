// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MakerRegistry} from "../../src/MakerRegistry.sol";
import {FeeDistributor} from "../../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../../src/StoaRouter.sol";
import {RugCover} from "../../src/RugCover.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2} from "../mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../../src/interfaces/IStoa.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Pons factory stand-in: getLaunchedToken(address) returns (token, curve, creator, ...)
contract InvPonsFactory {
    struct Launched {
        address token;
        address curve;
        address creator;
        address feeTo;
        uint256 extra;
    }

    mapping(address => Launched) internal _l;

    function set(address token, address creator) external {
        _l[token] = Launched(token, address(0xC0FFEE), creator, creator, 1);
    }

    function getLaunchedToken(address token) external view returns (Launched memory) {
        return _l[token];
    }
}

/// @dev Drives RugCover with random terms, covered buys, dumps, breaches, releases, claims, locks, unlocks, reward
///      claims, burns, pauses and time. Calls the contract may refuse are wrapped in try/catch.
contract RugCoverHandler is Test {
    uint256 constant M = 1_000_000 ether;

    RugCover public rc;
    MockToken stoa;
    MockAdapter uni;
    address gov;
    address guardian;
    address keeper;
    address public stranger = makeAddr("stranger");

    MockToken[2] public tokens;
    address[2] public creators;
    address[4] public buyers;
    address[3] public backers;

    /// @dev successful calls (a measured campaign of 64 runs x 128 calls reaches covered buys in every run,
    ///      breaches in about 95%, claims in about 65% and releases in about 20%)
    uint256 public opens;
    uint256 public buys;
    uint256 public breaches;
    uint256 public claims;
    uint256 public releases;
    /// @dev a claim that paid a buyer something other than their cover (must stay 0)
    uint256 public wrongClaims;

    constructor(
        RugCover rc_,
        MockToken stoa_,
        MockAdapter uni_,
        MockToken[2] memory tokens_,
        address[2] memory creators_,
        address gov_,
        address guardian_,
        address keeper_
    ) {
        rc = rc_;
        stoa = stoa_;
        uni = uni_;
        tokens = tokens_;
        creators = creators_;
        gov = gov_;
        guardian = guardian_;
        keeper = keeper_;
        buyers = [makeAddr("buyer0"), makeAddr("buyer1"), makeAddr("buyer2"), makeAddr("buyer3")];
        backers = [makeAddr("backer0"), makeAddr("backer1"), makeAddr("backer2")];
        for (uint256 i; i < 4; ++i) {
            vm.deal(buyers[i], 1_000 ether);
        }
        for (uint256 i; i < 2; ++i) {
            vm.deal(creators[i], 1_000 ether);
        }
        for (uint256 i; i < 3; ++i) {
            stoa.mint(backers[i], 100 * M);
            vm.prank(backers[i]);
            stoa.approve(address(rc), type(uint256).max);
        }
    }

    function _swap(address token, uint256 amountIn, address to) internal view returns (StoaRouter.SwapParams memory) {
        return StoaRouter.SwapParams({
            tokenIn: address(0),
            tokenOut: token,
            mid: address(0),
            leg1: StoaRouter.Leg(address(uni), false),
            leg2: StoaRouter.Leg(address(0), false),
            amountIn: amountIn,
            minOut: 0,
            to: to,
            deadline: block.timestamp,
            referrer: address(0)
        });
    }

    // ------------------------------------------------------------ creators

    function open(uint256 t, uint256 bond) external {
        uint256 i = t % 2;
        RugCover.Params memory p = rc.params();
        bond = bound(bond, p.minBond, p.maxBond);
        uint256 fee = rc.feeFor(bond);
        vm.prank(creators[i]);
        try rc.open{value: bond + fee}(address(tokens[i]), bond) {
            ++opens;
        } catch {}
    }

    /// @dev the creator sells or moves part of their tokens (a dump, or an innocent transfer)
    function dump(uint256 t, uint256 pct) external {
        uint256 i = t % 2;
        uint256 bal = tokens[i].balanceOf(creators[i]);
        uint256 amount = bal * bound(pct, 1, 20) / 100;
        if (amount == 0) return;
        vm.prank(creators[i]);
        tokens[i].transfer(address(uni), amount);
    }

    /// @dev the creator buys tokens back without cover, which can lift them above the floor again
    function buyBack(uint256 t, uint256 amount) external {
        uint256 i = t % 2;
        tokens[i].mint(creators[i], bound(amount, 1, 5 * M));
    }

    function release(uint256 t) external {
        uint256 i = t % 2;
        vm.prank(creators[i]);
        try rc.release(address(tokens[i]), creators[i]) {
            ++releases;
        } catch {}
    }

    // ------------------------------------------------------------ buyers

    function buyCovered(uint256 b, uint256 t, uint256 cover) external {
        address who = buyers[b % 4];
        address token = address(tokens[t % 2]);
        (uint256 id, RugCover.Term memory term) = rc.latestTerm(token);
        if (id == 0) return;
        // stay within this wallet's cap most of the time, so buys land and the caps get tested at their edge
        uint256 cap = uint256(term.capacity) * term.walletCapBps / 10_000;
        uint256 held = rc.coverOf(token, id, who);
        uint256 hi = cap > held ? cap - held : 0;
        if (hi > term.maxCover) hi = term.maxCover;
        if (hi < term.minCover) hi = term.maxCover; // try anyway: the contract must refuse it
        cover = bound(cover, term.minCover, hi);
        uint256 prem;
        try rc.premiumFor(token, cover) returns (uint256 x) {
            prem = x;
        } catch {
            return;
        }
        vm.prank(who);
        try rc.buyCovered{value: cover + prem}(_swap(token, cover, who)) {
            ++buys;
        } catch {}
    }

    function breach(uint256 t) external {
        vm.prank(stranger);
        try rc.breach(address(tokens[t % 2])) {
            ++breaches;
        } catch {}
    }

    function claim(uint256 b, uint256 t, uint256 id) external {
        address who = buyers[b % 4];
        address token = address(tokens[t % 2]);
        uint256 n = rc.termCount(token);
        if (n == 0) return;
        id = bound(id, 1, n);
        uint256 owed = rc.coverOf(token, id, who);
        uint256 before = who.balance;
        vm.prank(who);
        try rc.claim(token, id, who) returns (uint256 amount) {
            ++claims;
            if (amount != owed || who.balance - before != owed) ++wrongClaims;
        } catch {}
    }

    function withdrawCredit() external {
        vm.prank(stranger);
        try rc.withdrawCredit(stranger) {} catch {}
    }

    // ------------------------------------------------------------ backers

    function lock(uint256 k, uint256 amount) external {
        vm.prank(backers[k % 3]);
        try rc.lock(bound(amount, 1, 10 * M)) {} catch {}
    }

    function requestUnlock(uint256 k, uint256 amount) external {
        address who = backers[k % 3];
        (uint128 active,,) = rc.backers(who);
        if (active == 0) return;
        vm.prank(who);
        try rc.requestUnlock(bound(amount, 1, active)) {} catch {}
    }

    function withdraw(uint256 k) external {
        address who = backers[k % 3];
        vm.prank(who);
        try rc.withdraw(who) {} catch {}
    }

    function emergencyWithdraw(uint256 k) external {
        address who = backers[k % 3];
        vm.prank(who);
        try rc.emergencyWithdraw(who) {} catch {}
    }

    function claimRewards(uint256 k) external {
        address who = backers[k % 3];
        vm.prank(who);
        try rc.claimRewards(who) {} catch {}
    }

    // ------------------------------------------------------------ keeper, guardian, time

    function burn() external {
        vm.prank(keeper);
        try rc.burn(address(0), StoaRouter.Leg(address(uni), false), StoaRouter.Leg(address(0), false), 0) {} catch {}
    }

    /// @dev pauses now and then (the guardian), and the next call unpauses (the timelock), so pauses are tested
    ///      without freezing the whole run
    function togglePause(uint256 seed) external {
        if (rc.paused()) {
            vm.prank(gov);
            rc.unpause();
        } else if (seed % 3 == 0) {
            vm.prank(guardian);
            rc.pause();
        }
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 minutes, 2 days));
    }
}

/// @notice RugCover always holds every wei it owes, its running totals match the terms, covers and backers they
///         summarize, no term sells more cover than its capacity, and claims pay exactly the cover bought.
contract RugCoverInvariantTest is StdInvariant, Test {
    uint256 constant M = 1_000_000 ether;

    RugCover rc;
    MockToken stoa;
    RugCoverHandler h;

    address gov = makeAddr("gov");
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address creator = makeAddr("creator");
    address creator2 = makeAddr("creator2");
    MockToken tok;
    MockToken tok2;
    MockAdapter uni;
    StoaRouter router;

    function _params() internal pure returns (RugCover.Params memory) {
        return RugCover.Params({
            term: 3 days,
            feeBps: 200,
            capacityBps: 7500,
            premiumBps: 100,
            walletCapBps: 2500,
            bountyBps: 100,
            burnBps: 1000,
            minFloorBps: 50,
            minFee: 0.002 ether,
            minBond: 0.05 ether,
            maxBond: 1 ether,
            minCover: 0.005 ether,
            maxCover: 0.25 ether,
            maxTotalBonds: 20 ether
        });
    }

    function _deployRouter() internal {
        MockWHYPE weth = new MockWHYPE();
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        FeeDistributor fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        uni = new MockAdapter(1000, 1);
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();
    }

    function setUp() public {
        vm.warp(1_795_000_000);
        _deployRouter();
        stoa = new MockToken("STOA", 18);
        tok = new MockToken("TOK", 18);
        tok2 = new MockToken("TOK2", 18);
        InvPonsFactory factory = new InvPonsFactory();
        factory.set(address(tok), creator);
        factory.set(address(tok2), creator2);
        tok.mint(creator, 50 * M);
        tok.mint(address(uni), 950 * M);
        tok2.mint(creator2, 10 * M);
        tok2.mint(address(uni), 990 * M);
        stoa.mint(address(uni), 1_000 * M);
        rc = new RugCover(gov, router, IERC20(address(stoa)), address(factory), guardian, keeper, _params());

        h = new RugCoverHandler(rc, stoa, uni, [tok, tok2], [creator, creator2], gov, guardian, keeper);
        // every run starts with both tokens covered, some cover sold and a backer locked, so breaches, claims,
        // releases and backer income are reachable in every run
        h.open(0, 0.5 ether);
        h.open(1, 0.3 ether);
        h.buyCovered(0, 0, 0.05 ether);
        h.buyCovered(1, 1, 0.03 ether);
        h.lock(0, 5 * M);
        targetContract(address(h));
        // covered buys and opens come up more often than the rest, so most runs reach breaches and claims
        bytes4[] memory sel = new bytes4[](20);
        sel[0] = RugCoverHandler.open.selector;
        sel[1] = RugCoverHandler.open.selector;
        sel[2] = RugCoverHandler.dump.selector;
        sel[3] = RugCoverHandler.buyBack.selector;
        sel[4] = RugCoverHandler.release.selector;
        sel[5] = RugCoverHandler.buyCovered.selector;
        sel[6] = RugCoverHandler.buyCovered.selector;
        sel[7] = RugCoverHandler.buyCovered.selector;
        sel[8] = RugCoverHandler.breach.selector;
        sel[9] = RugCoverHandler.claim.selector;
        sel[10] = RugCoverHandler.claim.selector;
        sel[11] = RugCoverHandler.withdrawCredit.selector;
        sel[12] = RugCoverHandler.lock.selector;
        sel[13] = RugCoverHandler.requestUnlock.selector;
        sel[14] = RugCoverHandler.withdraw.selector;
        sel[15] = RugCoverHandler.emergencyWithdraw.selector;
        sel[16] = RugCoverHandler.claimRewards.selector;
        sel[17] = RugCoverHandler.burn.selector;
        sel[18] = RugCoverHandler.togglePause.selector;
        sel[19] = RugCoverHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// @dev bonds, unclaimed covers, the burn pot, bounties, earned and still-streaming backer income
    function _owed() internal view returns (uint256 owed) {
        owed = rc.totalBonds() + rc.totalOwed() + rc.burnPot() + rc.totalCredits() + rc.unstreamed();
        for (uint256 i; i < 3; ++i) {
            owed += rc.earned(h.backers(i));
        }
    }

    function invariant_ethCoversEverythingOwed() public view {
        assertGe(address(rc).balance, _owed(), "ETH held < ETH owed");
    }

    /// @dev $STOA held is exactly what backers locked; the burn sends bought $STOA straight to 0x...dEaD
    function invariant_stoaMatchesBackers() public view {
        uint256 active;
        uint256 locked;
        for (uint256 i; i < 3; ++i) {
            (uint128 a, uint128 p,) = rc.backers(h.backers(i));
            active += a;
            locked += uint256(a) + p;
        }
        assertEq(rc.totalActive(), active, "totalActive");
        assertEq(rc.totalLocked(), locked, "totalLocked");
        assertEq(stoa.balanceOf(address(rc)), locked, "STOA held != STOA locked");
    }

    /// @dev totalBonds is the bonds of open terms, totalOwed the unclaimed cover of breached terms, and no term or
    ///      wallet holds more cover than its limits
    function invariant_termTotalsMatch() public view {
        uint256 bonds;
        uint256 owed;
        for (uint256 i; i < 2; ++i) {
            address token = address(h.tokens(i));
            uint256 n = rc.termCount(token);
            for (uint256 id = 1; id <= n; ++id) {
                RugCover.Term memory t = rc.term(token, id);
                if (t.status == rc.OPEN()) {
                    bonds += t.bond;
                    assertEq(id, n, "an older term is still open");
                }
                assertLe(t.sold, t.capacity, "cover sold above capacity");
                assertLe(uint256(t.capacity) * 10_000, uint256(t.bond) * rc.MAX_CAPACITY_BPS(), "capacity above 75%");
                uint256 coverSum;
                for (uint256 b; b < 4; ++b) {
                    uint256 c = rc.coverOf(token, id, h.buyers(b));
                    assertLe(c * 10_000, uint256(t.capacity) * t.walletCapBps, "one wallet above its cap");
                    coverSum += c;
                }
                if (t.status == rc.BREACHED()) owed += coverSum;
                else assertEq(coverSum, t.sold, "cover held != cover sold");
            }
        }
        assertEq(rc.totalBonds(), bonds, "totalBonds");
        assertEq(rc.totalOwed(), owed, "totalOwed");
        assertEq(rc.totalCredits(), rc.credits(h.stranger()), "totalCredits");
    }

    function invariant_claimsPayExactlyTheCover() public view {
        assertEq(h.wrongClaims(), 0, "a claim paid something other than the cover");
    }
}
