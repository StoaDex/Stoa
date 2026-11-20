// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ArbSysMock} from "./ForkRobinhood.t.sol";
import {StoaRouter} from "../src/StoaRouter.sol";
import {RugCover} from "../src/RugCover.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TokenPackageRobinhood} from "../script/TokenPackageRobinhood.sol";

/// @notice RugCover against the LIVE Robinhood Chain router and the real Pons factory, with $STOA (a Pons launch,
///         now in its Uniswap V4 graduation pool) as the covered token: its real creator opens a term, a buyer buys
///         covered through the live router, the creator dumps, anyone breaches, the buyer claims, a backer earns, and
///         the burn pot buys $STOA through the live router into 0x...dEaD.
/// Skipped unless ROBINHOOD_RPC_URL is set:  ROBINHOOD_RPC_URL=... forge test --match-contract ForkRobinhoodRugCover -vv
contract ForkRobinhoodRugCoverTest is Test, TokenPackageRobinhood {
    address constant BURN = 0x000000000000000000000000000000000000dEaD;
    address constant GUARDIAN = 0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9;
    address constant PONS_FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant STOA_CREATOR = 0x8DAc20C0FE1C59D337808f234921a89Ee0C1346a;
    uint256 constant M = 1_000_000 ether;

    StoaRouter router = StoaRouter(payable(LIVE_ROUTER));
    IERC20 stoa = IERC20(STOA);
    RugCover rc;
    address buyer = makeAddr("buyer");
    address backer = makeAddr("backer");
    address watcher = makeAddr("watcher");
    bool on;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        on = true;
        vm.etch(address(0x64), address(new ArbSysMock()).code);
        rc = new RugCover(
            LIVE_TIMELOCK,
            router,
            stoa,
            PONS_FACTORY,
            GUARDIAN,
            KEEPER,
            RugCover.Params({
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
            })
        );
        deal(STOA, STOA_CREATOR, 6 * M); // 0.6% of supply, above the 0.5% floor
        deal(STOA, backer, 4 * M);
        vm.deal(STOA_CREATOR, 2 ether);
        vm.deal(buyer, 1 ether);
    }

    function test_fork_realCreatorRealRouter_breachClaimBurn() public {
        if (!on) return vm.skip(true);
        assertEq(rc.creatorOf(STOA), STOA_CREATOR, "creator read from the live Pons factory");

        vm.startPrank(backer);
        stoa.approve(address(rc), type(uint256).max);
        rc.lock(4 * M);
        vm.stopPrank();

        uint256 bond = 0.4 ether;
        uint256 fee = rc.feeFor(bond);
        vm.prank(STOA_CREATOR);
        rc.open{value: bond + fee}(STOA, bond);
        assertEq(rc.term(STOA, 1).floor, 6 * M);

        // a covered buy through the live route
        uint256 cover = 0.05 ether;
        StoaRouter.Quote memory q = router.quote(address(0), STOA, cover);
        assertGt(q.amountOut, 0, "live route to STOA");
        StoaRouter.SwapParams memory s = StoaRouter.SwapParams({
            tokenIn: address(0),
            tokenOut: STOA,
            mid: q.mid,
            leg1: q.leg1,
            leg2: q.leg2,
            amountIn: cover,
            minOut: q.amountOut * 99 / 100,
            to: buyer,
            deadline: block.timestamp,
            referrer: address(0)
        });
        uint256 prem = rc.premiumFor(STOA, cover);
        vm.prank(buyer);
        uint256 out = rc.buyCovered{value: cover + prem}(s);
        console2.log("covered buy, STOA out", out / 1e18);
        assertEq(stoa.balanceOf(buyer), out);

        // the creator moves part of its bag: anyone breaches
        vm.prank(STOA_CREATOR);
        stoa.transfer(makeAddr("otherWallet"), 1 * M);
        assertTrue(rc.breachable(STOA));
        vm.prank(watcher);
        uint256 bounty = rc.breach(STOA);
        assertEq(bounty, bond / 100);

        uint256 b = buyer.balance;
        vm.prank(buyer);
        rc.claim(STOA, 1, buyer);
        assertEq(buyer.balance - b, cover, "the buyer gets all the ETH it swapped back");

        vm.warp(block.timestamp + 8 days);
        uint256 e = rc.earned(backer);
        // 90% of the fee (0.008) and of the rest (0.4 - 0.05 - 0.004)
        assertApproxEqAbs(e, (0.008 ether + 0.346 ether) * 9 / 10, 1e6);
        vm.prank(backer);
        rc.claimRewards(backer);

        uint256 pot = rc.burnPot();
        StoaRouter.Quote memory bq = router.quote(address(0), STOA, pot);
        uint256 before = stoa.balanceOf(BURN);
        vm.prank(KEEPER);
        uint256 burned = rc.burn(bq.mid, bq.leg1, bq.leg2, bq.amountOut * 99 / 100);
        console2.log("burned STOA", burned / 1e18);
        assertEq(stoa.balanceOf(BURN) - before, burned);

        vm.prank(watcher);
        rc.withdrawCredit(watcher);
        assertLt(address(rc).balance, 100, "everything paid out");
    }
}
