// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MakerRegistry} from "../src/MakerRegistry.sol";
import {FeeDistributor} from "../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {RugCover} from "../src/RugCover.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2} from "./mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Pons factory stand-in: getLaunchedToken(address) returns a struct whose first three words are
///      (token, curve, creator), like the live factory (selector 0x3cf28b5a)
contract MockPonsFactory {
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

/// @dev a buyer contract that tries to claim twice while being paid
contract ReentrantBuyer {
    RugCover rc;
    address token;
    uint256 id;
    bool tried;

    constructor(RugCover rc_) {
        rc = rc_;
    }

    function buy(StoaRouter.SwapParams calldata s) external payable {
        rc.buyCovered{value: msg.value}(s);
    }

    function claimTwice(address t, uint256 i) external {
        token = t;
        id = i;
        rc.claim(t, i, address(this));
    }

    receive() external payable {
        if (!tried) {
            tried = true;
            rc.claim(token, id, address(this));
        }
    }
}

contract RugCoverTest is Test {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    uint256 constant M = 1_000_000 ether;

    RugCover rc;
    StoaRouter router;
    FeeDistributor fees;
    MockWHYPE weth;
    MockToken stoa;
    MockToken tok; // a Pons token
    MockToken tok2; // another Pons token
    MockToken notPons;
    MockAdapter uni;
    MockPonsFactory factory;

    address gov = makeAddr("gov"); // the timelock
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address creator = makeAddr("creator");
    address creator2 = makeAddr("creator2");
    address b1 = makeAddr("buyer1");
    address b2 = makeAddr("buyer2");
    address b3 = makeAddr("buyer3");
    address b4 = makeAddr("buyer4");
    address b5 = makeAddr("buyer5");
    address k1 = makeAddr("backer1");
    address k2 = makeAddr("backer2");
    address stranger = makeAddr("stranger");

    function _p() internal pure returns (RugCover.Params memory) {
        return RugCover.Params({
            term: 7 days,
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

    function setUp() public {
        vm.warp(1_795_000_000);
        weth = new MockWHYPE();
        stoa = new MockToken("STOA", 18);
        tok = new MockToken("TOK", 18);
        tok2 = new MockToken("TOK2", 18);
        notPons = new MockToken("NOPE", 18);
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        uni = new MockAdapter(1000, 1); // 1 ETH -> 1000 tokens
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();

        factory = new MockPonsFactory();
        factory.set(address(tok), creator);
        factory.set(address(tok2), creator2);

        // 1B supply each: the creator holds 5%, the venue the rest
        tok.mint(creator, 50 * M);
        tok.mint(address(uni), 950 * M);
        tok2.mint(creator2, 10 * M);
        tok2.mint(address(uni), 990 * M);
        notPons.mint(creator, 50 * M);
        notPons.mint(address(uni), 950 * M);
        stoa.mint(address(uni), 1_000 * M);

        rc = new RugCover(gov, router, IERC20(address(stoa)), address(factory), guardian, keeper, _p());

        address[9] memory who = [creator, creator2, b1, b2, b3, b4, b5, stranger, keeper];
        for (uint256 i; i < who.length; ++i) {
            vm.deal(who[i], 100 ether);
        }
        stoa.mint(k1, 100 * M);
        stoa.mint(k2, 100 * M);
        vm.prank(k1);
        stoa.approve(address(rc), type(uint256).max);
        vm.prank(k2);
        stoa.approve(address(rc), type(uint256).max);
    }

    // ------------------------------------------------------------ helpers

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

    function _open(address who, address token, uint256 bond) internal returns (uint256 id) {
        uint256 fee = rc.feeFor(bond);
        vm.prank(who);
        id = rc.open{value: bond + fee}(token, bond);
    }

    function _buy(address who, address token, uint256 cover) internal returns (uint256 out) {
        uint256 prem = rc.premiumFor(token, cover);
        vm.prank(who);
        out = rc.buyCovered{value: cover + prem}(_swap(token, cover, who));
    }

    function _dump(address who, MockToken token, uint256 amount) internal {
        vm.prank(who);
        token.transfer(address(uni), amount);
    }

    /// @dev every ETH the contract owes, which its balance must always cover
    function _owed() internal view returns (uint256) {
        return rc.totalBonds() + rc.totalOwed() + rc.burnPot() + rc.totalCredits() + rc.earned(k1) + rc.earned(k2)
            + rc.unstreamed();
    }

    // ------------------------------------------------------------ opening

    function test_open_byTheCreator_floorIsWholeBalance() public {
        uint256 bond = 0.5 ether;
        uint256 fee = rc.feeFor(bond);
        assertEq(fee, 0.01 ether, "2% of the bond");
        uint256 id = _open(creator, address(tok), bond);
        assertEq(id, 1);
        RugCover.Term memory t = rc.term(address(tok), 1);
        assertEq(t.creator, creator);
        assertEq(t.status, rc.OPEN());
        assertEq(t.floor, 50 * M);
        assertEq(t.bond, bond);
        assertEq(t.capacity, 0.375 ether);
        assertEq(t.endsAt, block.timestamp + 7 days);
        assertEq(rc.totalBonds(), bond);
        assertEq(rc.burnPot(), fee, "no backers: the whole fee goes to the burn pot");
        assertEq(address(rc).balance, bond + fee);
        address[] memory o = rc.openTokens();
        assertEq(o.length, 1);
        assertEq(o[0], address(tok));
    }

    function test_open_minimumFee() public {
        assertEq(rc.feeFor(0.05 ether), 0.002 ether, "2% of 0.05 is below the 0.002 minimum");
    }

    function test_open_onlyThePonsCreator() public {
        uint256 fee = rc.feeFor(0.5 ether);
        vm.prank(stranger);
        vm.expectRevert(RugCover.NotCreator.selector);
        rc.open{value: 0.5 ether + fee}(address(tok), 0.5 ether);
        vm.prank(creator);
        vm.expectRevert(RugCover.NotCreator.selector);
        rc.open{value: 0.5 ether + fee}(address(notPons), 0.5 ether);
        vm.prank(creator);
        vm.expectRevert(RugCover.NotCreator.selector);
        rc.open{value: 0.5 ether + fee}(address(tok2), 0.5 ether);
        assertEq(rc.creatorOf(address(tok)), creator);
        assertEq(rc.creatorOf(address(notPons)), address(0));
    }

    function test_open_exactValueAndBondBounds() public {
        vm.startPrank(creator);
        vm.expectRevert(RugCover.BadValue.selector);
        rc.open{value: 0.5 ether}(address(tok), 0.5 ether);
        vm.expectRevert(RugCover.BadValue.selector);
        rc.open{value: 0.6 ether}(address(tok), 0.5 ether);
        vm.expectRevert(RugCover.BadBond.selector);
        rc.open{value: 0.05 ether}(address(tok), 0.049 ether);
        vm.expectRevert(RugCover.BadBond.selector);
        rc.open{value: 1.1 ether}(address(tok), 1.01 ether);
        vm.stopPrank();
    }

    function test_open_minFloor() public {
        // 0.5% of 1B = 5M: a creator with 4.99M cannot open
        vm.prank(creator2);
        tok2.transfer(address(uni), 10 * M - 4_990_000 ether);
        uint256 fee = rc.feeFor(0.1 ether);
        vm.prank(creator2);
        vm.expectRevert(RugCover.FloorTooLow.selector);
        rc.open{value: 0.1 ether + fee}(address(tok2), 0.1 ether);
        // with exactly 0.5% it can
        vm.prank(address(uni));
        tok2.transfer(creator2, 10_000 ether);
        _open(creator2, address(tok2), 0.1 ether);
    }

    function test_open_oneTermAtATime_thenANewOne() public {
        _open(creator, address(tok), 0.5 ether);
        uint256 fee = rc.feeFor(0.5 ether);
        vm.prank(creator);
        vm.expectRevert(RugCover.TermOpen.selector);
        rc.open{value: 0.5 ether + fee}(address(tok), 0.5 ether);
        vm.warp(block.timestamp + 8 days);
        vm.prank(creator);
        rc.release(address(tok), creator);
        uint256 id = _open(creator, address(tok), 0.2 ether);
        assertEq(id, 2);
    }

    function test_open_totalBondCap() public {
        RugCover.Params memory p = _p();
        p.maxTotalBonds = 1.5 ether;
        vm.prank(gov);
        rc.setParams(p);
        _open(creator, address(tok), 1 ether);
        uint256 fee = rc.feeFor(0.6 ether);
        vm.prank(creator2);
        vm.expectRevert(RugCover.BondCap.selector);
        rc.open{value: 0.6 ether + fee}(address(tok2), 0.6 ether);
        _open(creator2, address(tok2), 0.5 ether);
    }

    // ------------------------------------------------------------ covered buys

    function test_buyCovered_tokensToBuyer_premiumToBurnPot() public {
        _open(creator, address(tok), 0.5 ether);
        uint256 pot0 = rc.burnPot();
        uint256 out = _buy(b1, address(tok), 0.09 ether);
        assertGt(out, 0);
        assertEq(tok.balanceOf(b1), out, "the router pays the buyer");
        assertEq(rc.coverOf(address(tok), 1, b1), 0.09 ether);
        assertEq(rc.term(address(tok), 1).sold, 0.09 ether);
        assertEq(rc.burnPot() - pot0, 0.0009 ether, "1% premium, all to the burn pot");
        assertEq(address(rc).balance, rc.totalBonds() + rc.burnPot(), "the swapped ETH left with the swap");
    }

    function test_buyCovered_checks() public {
        _open(creator, address(tok), 0.5 ether); // capacity 0.375, wallet cap 0.09375
        StoaRouter.SwapParams memory s = _swap(address(tok), 0.05 ether, b1);

        vm.startPrank(b1);
        // value must be cover + premium
        vm.expectRevert(RugCover.BadValue.selector);
        rc.buyCovered{value: 0.05 ether}(s);
        // the tokens must go to the caller
        s.to = b2;
        vm.expectRevert(RugCover.BadSwap.selector);
        rc.buyCovered{value: 0.0505 ether}(s);
        s.to = b1;
        // ETH in only
        s.tokenIn = address(weth);
        vm.expectRevert(RugCover.BadSwap.selector);
        rc.buyCovered{value: 0.0505 ether}(s);
        s.tokenIn = address(0);
        // per-buy bounds
        s.amountIn = 0.004 ether;
        vm.expectRevert(RugCover.BadCover.selector);
        rc.buyCovered{value: 0.00404 ether}(s);
        // no cover on a token without an open term
        s.amountIn = 0.05 ether;
        s.tokenOut = address(tok2);
        vm.expectRevert(RugCover.NoCover.selector);
        rc.buyCovered{value: 0.0505 ether}(s);
        vm.stopPrank();

        // wallet cap: 25% of 0.375 = 0.09375
        _buy(b1, address(tok), 0.09 ether);
        uint256 prem = rc.premiumFor(address(tok), 0.005 ether);
        vm.prank(b1);
        vm.expectRevert(RugCover.WalletCap.selector);
        rc.buyCovered{value: 0.005 ether + prem}(_swap(address(tok), 0.005 ether, b1));

        // the creator cannot buy its own cover
        vm.prank(creator);
        vm.expectRevert(RugCover.CreatorCannotBuy.selector);
        rc.buyCovered{value: 0.0505 ether}(_swap(address(tok), 0.05 ether, creator));
    }

    function test_buyCovered_capacityIsAHardLimit() public {
        _open(creator, address(tok), 0.5 ether); // capacity 0.375
        _buy(b1, address(tok), 0.09 ether);
        _buy(b2, address(tok), 0.09 ether);
        _buy(b3, address(tok), 0.09 ether);
        _buy(b4, address(tok), 0.09 ether); // 0.36 sold
        uint256 prem = rc.premiumFor(address(tok), 0.02 ether);
        vm.prank(b5);
        vm.expectRevert(RugCover.CapacityFull.selector);
        rc.buyCovered{value: 0.02 ether + prem}(_swap(address(tok), 0.02 ether, b5));
        _buy(b5, address(tok), 0.015 ether); // exactly full
        assertEq(rc.term(address(tok), 1).sold, 0.375 ether);
    }

    function test_buyCovered_stopsADayBeforeTheEnd() public {
        _open(creator, address(tok), 0.5 ether);
        vm.warp(block.timestamp + 6 days);
        _buy(b1, address(tok), 0.05 ether);
        vm.warp(block.timestamp + 1);
        uint256 prem = rc.premiumFor(address(tok), 0.05 ether);
        vm.prank(b2);
        vm.expectRevert(RugCover.SalesClosed.selector);
        rc.buyCovered{value: 0.05 ether + prem}(_swap(address(tok), 0.05 ether, b2));
    }

    function test_buyCovered_refusedOnceTheCreatorIsBelowTheFloor() public {
        _open(creator, address(tok), 0.5 ether);
        _dump(creator, tok, 1);
        uint256 prem = rc.premiumFor(address(tok), 0.05 ether);
        vm.prank(b1);
        vm.expectRevert(RugCover.Breachable.selector);
        rc.buyCovered{value: 0.05 ether + prem}(_swap(address(tok), 0.05 ether, b1));
    }

    // ------------------------------------------------------------ breach

    function test_breach_paysBuyersBountyAndSplitsTheRest() public {
        vm.prank(k1);
        rc.lock(10 * M);
        _open(creator, address(tok), 1 ether); // capacity 0.75
        _buy(b1, address(tok), 0.18 ether);
        _buy(b2, address(tok), 0.12 ether);

        vm.expectRevert(RugCover.NotBreached.selector);
        rc.breach(address(tok));
        assertFalse(rc.breachable(address(tok)));

        _dump(creator, tok, 30 * M); // sells part of its bag
        assertTrue(rc.breachable(address(tok)));
        uint256 pot0 = rc.burnPot();
        vm.prank(stranger);
        uint256 bounty = rc.breach(address(tok));
        assertEq(bounty, 0.01 ether, "1% of the bond");
        assertEq(rc.credits(stranger), bounty);
        assertEq(rc.term(address(tok), 1).status, rc.BREACHED());
        assertEq(rc.totalBonds(), 0);
        assertEq(rc.totalOwed(), 0.3 ether);
        // rest = 1 - 0.3 - 0.01 = 0.69: 10% burned, 90% streamed to backers
        assertEq(rc.burnPot() - pot0, 0.069 ether);
        assertEq(rc.openTokens().length, 0);

        uint256 before = b1.balance;
        vm.prank(b1);
        rc.claim(address(tok), 1, b1);
        assertEq(b1.balance - before, 0.18 ether, "all the ETH b1 swapped");
        vm.prank(b1);
        vm.expectRevert(RugCover.NothingToClaim.selector);
        rc.claim(address(tok), 1, b1);
        vm.prank(b3);
        vm.expectRevert(RugCover.NothingToClaim.selector);
        rc.claim(address(tok), 1, b3);

        vm.prank(stranger);
        rc.withdrawCredit(stranger);
        assertEq(rc.credits(stranger), 0);

        // a second breach, a release or more cover on that term are impossible
        vm.expectRevert(RugCover.NoCover.selector);
        rc.breach(address(tok));
        vm.warp(block.timestamp + 9 days);
        vm.prank(creator);
        vm.expectRevert(RugCover.NoCover.selector);
        rc.release(address(tok), creator);

        // backers get the 90% over 7 days
        assertApproxEqAbs(rc.earned(k1), 0.621 ether + 0.018 ether, 1e6, "90% of the rest and of the fee");
        vm.prank(b2);
        rc.claim(address(tok), 1, b2);
        assertGe(address(rc).balance, _owed());
    }

    function test_breach_aTransferCountsLikeASale() public {
        _open(creator, address(tok), 0.5 ether);
        _buy(b1, address(tok), 0.05 ether);
        vm.prank(creator);
        tok.transfer(makeAddr("freshWallet"), 1);
        rc.breach(address(tok));
        assertEq(rc.term(address(tok), 1).status, rc.BREACHED());
    }

    function test_breach_buyingMoreAndSellingTheExtraIsFine() public {
        _open(creator, address(tok), 0.5 ether);
        tok.mint(creator, 5 * M); // bought more after opening
        _dump(creator, tok, 5 * M); // and sold only that
        assertFalse(rc.breachable(address(tok)));
        vm.expectRevert(RugCover.NotBreached.selector);
        rc.breach(address(tok));
    }

    function test_breach_lastMinuteDumpIsCaughtInTheGrace() public {
        _open(creator, address(tok), 0.5 ether);
        _buy(b1, address(tok), 0.05 ether);
        RugCover.Term memory t = rc.term(address(tok), 1);
        vm.warp(t.endsAt - 1);
        _dump(creator, tok, 50 * M);
        vm.warp(t.endsAt + 1);
        // the creator cannot release before the grace ends, nor after while below the floor
        vm.prank(creator);
        vm.expectRevert(RugCover.TooEarly.selector);
        rc.release(address(tok), creator);
        vm.warp(t.endsAt + 1 days);
        vm.prank(creator);
        vm.expectRevert(RugCover.Breachable.selector);
        rc.release(address(tok), creator);
        rc.breach(address(tok));
        vm.prank(b1);
        assertEq(rc.claim(address(tok), 1, b1), 0.05 ether);
    }

    function test_breach_worksWhilePaused() public {
        _open(creator, address(tok), 0.5 ether);
        _buy(b1, address(tok), 0.05 ether);
        vm.prank(guardian);
        rc.pause();
        _dump(creator, tok, 50 * M);
        rc.breach(address(tok));
        vm.prank(b1);
        rc.claim(address(tok), 1, b1);
    }

    // ------------------------------------------------------------ release

    function test_release_afterTermAndGrace_returnsBond() public {
        _open(creator, address(tok), 0.5 ether);
        _buy(b1, address(tok), 0.05 ether);
        RugCover.Term memory t = rc.term(address(tok), 1);
        vm.warp(t.endsAt + 1 days - 1);
        vm.prank(creator);
        vm.expectRevert(RugCover.TooEarly.selector);
        rc.release(address(tok), creator);
        vm.warp(t.endsAt + 1 days);
        vm.prank(stranger);
        vm.expectRevert(RugCover.NotCreator.selector);
        rc.release(address(tok), stranger);
        address safe = makeAddr("creatorSafe");
        vm.prank(creator);
        assertEq(rc.release(address(tok), safe), 0.5 ether);
        assertEq(safe.balance, 0.5 ether);
        assertEq(rc.totalBonds(), 0);
        assertEq(rc.term(address(tok), 1).status, rc.RELEASED());
        // the creator may now sell; nothing can be breached or claimed any more
        _dump(creator, tok, 50 * M);
        vm.expectRevert(RugCover.NoCover.selector);
        rc.breach(address(tok));
        vm.prank(b1);
        vm.expectRevert(RugCover.NotBreached.selector);
        rc.claim(address(tok), 1, b1);
    }

    // ------------------------------------------------------------ backers

    function test_rewards_streamOverSevenDaysProRata() public {
        vm.prank(k1);
        rc.lock(30 * M);
        vm.prank(k2);
        rc.lock(10 * M);
        _open(creator, address(tok), 1 ether); // fee 0.02: 0.018 to backers
        vm.warp(block.timestamp + 3.5 days);
        assertApproxEqAbs(rc.earned(k1), 0.00675 ether, 1e9, "3/4 of half the stream");
        vm.warp(block.timestamp + 10 days);
        assertApproxEqAbs(rc.earned(k1), 0.0135 ether, 1e9);
        assertApproxEqAbs(rc.earned(k2), 0.0045 ether, 1e9);
        uint256 b = k1.balance;
        vm.prank(k1);
        rc.claimRewards(k1);
        assertApproxEqAbs(k1.balance - b, 0.0135 ether, 1e9);
        vm.prank(k1);
        vm.expectRevert(RugCover.NothingToClaim.selector);
        rc.claimRewards(k1);
    }

    function test_rewards_lateLockerOnlyEarnsWhatStreamsAfter() public {
        vm.prank(k1);
        rc.lock(10 * M);
        _open(creator, address(tok), 1 ether); // 0.018 to stream
        vm.warp(block.timestamp + 6 days);
        vm.prank(k2);
        rc.lock(10 * M); // locks for the last day only
        vm.warp(block.timestamp + 2 days);
        // k1: 6 days alone + half of the last day; k2: half of the last day
        assertApproxEqAbs(rc.earned(k1), uint256(0.018 ether) * 13 / 14, 1e9);
        assertApproxEqAbs(rc.earned(k2), uint256(0.018 ether) / 14, 1e9);
    }

    function test_rewards_newIncomeExtendsTheStream() public {
        vm.prank(k1);
        rc.lock(10 * M);
        _open(creator, address(tok), 1 ether); // 0.018
        vm.warp(block.timestamp + 3 days);
        _open(creator2, address(tok2), 1 ether); // another 0.018, restarts a 7-day stream with the leftover
        vm.warp(block.timestamp + 7 days);
        assertApproxEqAbs(rc.earned(k1), 0.036 ether, 1e9);
    }

    function test_unlock_stopsEarningAndWaitsSevenDays() public {
        vm.prank(k1);
        rc.lock(10 * M);
        vm.prank(k2);
        rc.lock(10 * M);
        _open(creator, address(tok), 1 ether);
        vm.warp(block.timestamp + 1 days);
        vm.prank(k2);
        rc.requestUnlock(10 * M);
        uint256 e2 = rc.earned(k2);
        vm.warp(block.timestamp + 6 days);
        assertEq(rc.earned(k2), e2, "pending $STOA earns nothing");
        assertApproxEqAbs(rc.earned(k1) + e2, 0.018 ether, 1e9);
        vm.prank(k2);
        vm.expectRevert(RugCover.TooEarly.selector);
        rc.withdraw(k2);
        vm.warp(block.timestamp + 1 days);
        vm.prank(k2);
        rc.withdraw(k2);
        assertEq(stoa.balanceOf(k2), 100 * M);
        vm.prank(k2);
        vm.expectRevert(RugCover.BadAmount.selector);
        rc.requestUnlock(1);
    }

    function test_unlock_maturedRequestIsPaidBeforeANewOne() public {
        vm.prank(k1);
        rc.lock(10 * M);
        vm.prank(k1);
        rc.requestUnlock(4 * M);
        vm.warp(block.timestamp + 8 days);
        vm.prank(k1);
        rc.requestUnlock(1 * M);
        assertEq(stoa.balanceOf(k1), 94 * M, "the matured 4M came out");
        (uint128 active, uint128 pending,) = rc.backers(k1);
        assertEq(active, 5 * M);
        assertEq(pending, 1 * M);
    }

    function test_noBackers_streamGapGoesToTheBurnPot() public {
        vm.prank(k1);
        rc.lock(10 * M);
        _open(creator, address(tok), 1 ether); // 0.018 streams, 0.002 burn pot
        vm.warp(block.timestamp + 2 days);
        vm.prank(k1);
        rc.requestUnlock(10 * M); // nobody earns from here
        uint256 e1 = rc.earned(k1);
        vm.warp(block.timestamp + 6 days);
        vm.prank(keeper);
        rc.burn(address(0), StoaRouter.Leg(address(uni), false), StoaRouter.Leg(address(0), false), 0);
        assertApproxEqAbs(rc.totalBurned(), (0.002 ether + 0.018 ether - e1) * 1000 * 9998 / 10000, 1e12);
        assertApproxEqAbs(e1, uint256(0.018 ether) * 2 / 7, 1e9);
    }

    function test_emergencyWithdraw_onlyWhilePaused() public {
        vm.prank(k1);
        rc.lock(10 * M);
        vm.prank(k1);
        rc.requestUnlock(4 * M);
        vm.prank(k1);
        vm.expectRevert(RugCover.NotPaused.selector);
        rc.emergencyWithdraw(k1);
        vm.prank(guardian);
        rc.pause();
        vm.prank(k1);
        assertEq(rc.emergencyWithdraw(k1), 10 * M);
        assertEq(stoa.balanceOf(k1), 100 * M);
        assertEq(rc.totalLocked(), 0);
        assertEq(rc.totalActive(), 0);
    }

    // ------------------------------------------------------------ burn, pause, params

    function test_burn_keeperOnly_toDead() public {
        _open(creator, address(tok), 0.5 ether);
        _buy(b1, address(tok), 0.05 ether);
        uint256 pot = rc.burnPot();
        assertEq(pot, 0.01 ether + 0.0005 ether);
        vm.prank(stranger);
        vm.expectRevert(RugCover.NotKeeper.selector);
        rc.burn(address(0), StoaRouter.Leg(address(uni), false), StoaRouter.Leg(address(0), false), 0);
        vm.prank(keeper);
        uint256 burned =
            rc.burn(address(0), StoaRouter.Leg(address(uni), false), StoaRouter.Leg(address(0), false), 10 ether);
        assertEq(stoa.balanceOf(BURN), burned);
        assertEq(rc.burnPot(), 0);
        assertEq(address(rc).balance, rc.totalBonds());
    }

    function test_pause_scope() public {
        _open(creator, address(tok), 0.5 ether);
        _buy(b1, address(tok), 0.05 ether);
        vm.prank(k1);
        rc.lock(1 * M);
        vm.prank(stranger);
        vm.expectRevert(RugCover.NotGuardian.selector);
        rc.pause();
        vm.prank(guardian);
        rc.pause();

        uint256 fee = rc.feeFor(0.5 ether);
        vm.prank(creator2);
        vm.expectRevert(RugCover.IsPaused.selector);
        rc.open{value: 0.5 ether + fee}(address(tok2), 0.5 ether);
        uint256 prem = rc.premiumFor(address(tok), 0.05 ether);
        vm.prank(b2);
        vm.expectRevert(RugCover.IsPaused.selector);
        rc.buyCovered{value: 0.05 ether + prem}(_swap(address(tok), 0.05 ether, b2));
        vm.prank(k1);
        vm.expectRevert(RugCover.IsPaused.selector);
        rc.lock(1);

        // release and unlocks still work
        vm.warp(block.timestamp + 8 days);
        vm.prank(creator);
        rc.release(address(tok), creator);
        vm.prank(k1);
        rc.requestUnlock(1 * M);

        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        rc.unpause();
        vm.prank(gov);
        rc.unpause();
        _open(creator2, address(tok2), 0.5 ether);
    }

    function test_params_bounds() public {
        RugCover.Params memory p = _p();
        vm.startPrank(gov);
        p.capacityBps = 7501;
        vm.expectRevert(RugCover.BadParams.selector);
        rc.setParams(p);
        p = _p();
        p.burnBps = 999;
        vm.expectRevert(RugCover.BadParams.selector);
        rc.setParams(p);
        p = _p();
        p.bountyBps = 201;
        vm.expectRevert(RugCover.BadParams.selector);
        rc.setParams(p);
        p = _p();
        p.term = 1 days;
        vm.expectRevert(RugCover.BadParams.selector);
        rc.setParams(p);
        p = _p();
        p.maxBond = 11 ether;
        p.maxTotalBonds = 20 ether;
        vm.expectRevert(RugCover.BadParams.selector);
        rc.setParams(p);
        p = _p();
        p.premiumBps = 501;
        vm.expectRevert(RugCover.BadParams.selector);
        rc.setParams(p);
        vm.stopPrank();
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        rc.setParams(_p());
        vm.prank(gov);
        vm.expectRevert(RugCover.NoRenounce.selector);
        rc.renounceOwnership();
    }

    function test_params_applyToNewTermsOnly() public {
        _open(creator, address(tok), 0.5 ether);
        RugCover.Params memory p = _p();
        p.premiumBps = 300;
        p.capacityBps = 5000;
        vm.prank(gov);
        rc.setParams(p);
        assertEq(rc.premiumFor(address(tok), 1 ether), 0.01 ether, "the open term keeps 1%");
        assertEq(rc.term(address(tok), 1).capacity, 0.375 ether);
        _open(creator2, address(tok2), 0.5 ether);
        assertEq(rc.premiumFor(address(tok2), 1 ether), 0.03 ether);
        assertEq(rc.term(address(tok2), 1).capacity, 0.25 ether);
    }

    function test_reentrantClaimIsRefused() public {
        ReentrantBuyer r = new ReentrantBuyer(rc);
        vm.deal(address(r), 1 ether);
        _open(creator, address(tok), 0.5 ether);
        uint256 prem = rc.premiumFor(address(tok), 0.05 ether);
        r.buy{value: 0.05 ether + prem}(_swap(address(tok), 0.05 ether, address(r)));
        _dump(creator, tok, 50 * M);
        rc.breach(address(tok));
        vm.expectRevert(RugCover.SendFailed.selector);
        r.claimTwice(address(tok), 1);
        assertEq(rc.coverOf(address(tok), 1, address(r)), 0.05 ether, "nothing paid, still claimable");
    }

    // ------------------------------------------------------------ economics

    /// @notice A creator who buys up its own cover from four other wallets, dumps and breaches always loses ETH,
    ///         even as the only backer collecting the rest. Swapped ETH is assumed fully recovered by selling the
    ///         tokens back (no trading fees), the attacker's best case.
    function testFuzz_selfRugAlwaysLoses(uint256 bond, uint256 fill, bool soleBacker) public {
        bond = bound(bond, 0.05 ether, 1 ether);
        fill = bound(fill, 0, 10_000);
        address[4] memory sybil = [b1, b2, b3, b4];
        uint256 paid;
        uint256 got;
        if (soleBacker) {
            vm.prank(k1);
            rc.lock(1 * M);
        }
        uint256 fee = rc.feeFor(bond);
        _open(creator, address(tok), bond);
        paid += bond + fee;
        RugCover.Term memory t = rc.term(address(tok), 1);
        uint256 want = uint256(t.capacity) * fill / 10_000;
        uint256 per = want / 4;
        if (per > t.maxCover) per = t.maxCover;
        if (per >= t.minCover) {
            for (uint256 i; i < 4; ++i) {
                uint256 prem = rc.premiumFor(address(tok), per);
                _buy(sybil[i], address(tok), per);
                paid += prem;
            }
        }
        _dump(creator, tok, 50 * M);
        vm.prank(creator);
        got += rc.breach(address(tok));
        if (per >= t.minCover) {
            for (uint256 i; i < 4; ++i) {
                vm.prank(sybil[i]);
                got += rc.claim(address(tok), 1, sybil[i]);
            }
        }
        if (soleBacker) {
            vm.warp(block.timestamp + 8 days);
            got += rc.earned(k1);
        }
        assertLt(got, paid, "self-rug must lose");
        // and by at least the burned share of the forfeited quarter
        assertGe(paid - got, bond * 23 / 1000);
    }

    /// @notice Random terms, buys, breaches, releases, locks and unlocks: the contract always holds at least
    ///         everything it owes, and once everyone has taken theirs only rounding dust is left.
    function testFuzz_ethIsConserved(uint256 seed) public {
        vm.prank(k1);
        rc.lock(5 * M);
        _open(creator, address(tok), bound(seed, 0.05 ether, 1 ether));
        _open(creator2, address(tok2), bound(seed >> 64, 0.05 ether, 1 ether));
        address[4] memory buyers = [b1, b2, b3, b4];
        for (uint256 i; i < 4; ++i) {
            address t = i % 2 == 0 ? address(tok) : address(tok2);
            uint256 walletCap = uint256(rc.term(t, 1).capacity) / 4;
            if (walletCap < 0.005 ether) continue;
            uint256 c = bound(uint256(keccak256(abi.encode(seed, i))), 0.005 ether, walletCap);
            if (rc.term(t, 1).sold + c <= rc.term(t, 1).capacity) _buy(buyers[i], t, c);
        }
        if ((seed >> 128) % 2 == 1) {
            vm.prank(k2);
            rc.lock(7 * M);
        }
        vm.warp(block.timestamp + bound(seed >> 136, 0, 6 days));
        assertGe(address(rc).balance, _owed());
        if ((seed >> 160) % 3 != 0) {
            _dump(creator, tok, 1 * M);
            vm.prank(stranger);
            rc.breach(address(tok));
        }
        if ((seed >> 170) % 2 == 1) {
            vm.prank(k1);
            rc.requestUnlock(5 * M);
        }
        assertGe(address(rc).balance, _owed());
        vm.warp(block.timestamp + 9 days);
        assertGe(address(rc).balance, _owed());

        // everyone takes what is theirs
        if (rc.term(address(tok), 1).status == rc.OPEN()) {
            vm.prank(creator);
            rc.release(address(tok), creator);
        }
        vm.prank(creator2);
        rc.release(address(tok2), creator2);
        for (uint256 i; i < 4; ++i) {
            address t = i % 2 == 0 ? address(tok) : address(tok2);
            if (rc.coverOf(t, 1, buyers[i]) > 0 && rc.term(t, 1).status == rc.BREACHED()) {
                vm.prank(buyers[i]);
                rc.claim(t, 1, buyers[i]);
            }
        }
        if (rc.credits(stranger) > 0) {
            vm.prank(stranger);
            rc.withdrawCredit(stranger);
        }
        if (rc.earned(k1) > 0) {
            vm.prank(k1);
            rc.claimRewards(k1);
        }
        if (rc.earned(k2) > 0) {
            vm.prank(k2);
            rc.claimRewards(k2);
        }
        if (rc.burnPot() > 0) {
            vm.prank(keeper);
            rc.burn(address(0), StoaRouter.Leg(address(uni), false), StoaRouter.Leg(address(0), false), 0);
        }
        assertLt(address(rc).balance, 100, "only rounding dust (wei) is left");
        assertEq(rc.totalBonds(), 0);
        assertEq(rc.totalOwed(), 0);
    }
}
