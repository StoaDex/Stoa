// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MakerRegistry} from "../../src/MakerRegistry.sol";
import {FeeDistributor} from "../../src/FeeDistributor.sol";
import {StoaRouter, ISignatureTransfer} from "../../src/StoaRouter.sol";
import {StoaLimit} from "../../src/StoaLimit.sol";
import {MockToken, MockAdapter, MockWHYPE, MockPermit2} from "../mocks/Mocks.sol";
import {IMakerRegistry, IFeeDistributor} from "../../src/interfaces/IStoa.sol";

/// @dev Drives StoaLimit with random creates, cancels, fills, price moves, pauses and time. Every call that the
///      contract may refuse is wrapped in try/catch, so the campaign keeps going and only the invariants decide.
contract LimitHandler is Test {
    address constant NATIVE = address(0);

    StoaLimit public lim;
    StoaRouter router;
    MockToken public tok;
    MockAdapter buyAd; // ETH -> TOK
    MockAdapter sellAd; // TOK -> WETH, unwrapped to ETH by the router
    address gov;
    address guardian;
    address keeper;
    address stranger = makeAddr("stranger");
    address[3] public makers;

    uint256[] public ids;
    /// @dev a fill that paid its maker less than the order's minimum (must stay 0)
    uint256 public underpaidFills;
    mapping(uint256 => bool) public closed;
    /// @dev successful calls (a measured campaign of 64 runs x 128 calls fills orders in about 85% of runs and
    ///      cancels them in nearly all)
    uint256 public fills;
    uint256 public cancels;

    constructor(
        StoaLimit lim_,
        StoaRouter router_,
        MockToken tok_,
        MockAdapter buyAd_,
        MockAdapter sellAd_,
        address gov_,
        address guardian_,
        address keeper_
    ) {
        lim = lim_;
        router = router_;
        tok = tok_;
        buyAd = buyAd_;
        sellAd = sellAd_;
        gov = gov_;
        guardian = guardian_;
        keeper = keeper_;
        makers = [makeAddr("maker0"), makeAddr("maker1"), makeAddr("maker2")];
        for (uint256 i; i < 3; ++i) {
            vm.deal(makers[i], 1_000 ether);
            tok.mint(makers[i], 10_000_000 ether);
            vm.prank(makers[i]);
            tok.approve(address(lim), type(uint256).max);
        }
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function createBuy(uint256 who, uint256 eth, uint256 pct, uint256 ttl) external {
        address m = makers[who % 3];
        eth = bound(eth, 0.001 ether, 5 ether);
        // the market pays about 1000 TOK per ETH; ask for 90% to 110% of that
        uint256 minOut = eth * 1000 * bound(pct, 90, 110) / 100;
        uint64 expiry = uint64(block.timestamp + bound(ttl, 1 hours, 30 days));
        vm.prank(m);
        try lim.create{value: eth}(NATIVE, address(tok), eth, minOut, expiry, address(0)) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function createSell(uint256 who, uint256 amt, uint256 pct, uint256 ttl) external {
        address m = makers[who % 3];
        amt = bound(amt, 1 ether, 5_000 ether);
        uint256 minOut = amt * bound(pct, 90, 110) / 100 / 1000;
        if (minOut == 0) return;
        uint64 expiry = uint64(block.timestamp + bound(ttl, 1 hours, 30 days));
        vm.prank(m);
        try lim.create(address(tok), NATIVE, amt, minOut, expiry, address(0)) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function cancel(uint256 pick, bool byMaker) external {
        if (ids.length == 0) return;
        uint256 id = ids[pick % ids.length];
        StoaLimit.Order memory o = lim.order(id);
        if (o.status != lim.OPEN()) return;
        uint256 balBefore = o.tokenIn == NATIVE ? o.maker.balance : tok.balanceOf(o.maker);
        vm.prank(byMaker ? o.maker : stranger);
        try lim.cancel(id) {
            closed[id] = true;
            ++cancels;
            uint256 balAfter = o.tokenIn == NATIVE ? o.maker.balance : tok.balanceOf(o.maker);
            // the whole deposit goes back to the maker, whoever cancels
            if (balAfter - balBefore != o.amountIn) underpaidFills += 1_000_000;
        } catch {}
    }

    function fill(uint256 pick, bool byMaker) external {
        if (ids.length == 0) return;
        uint256 id = ids[pick % ids.length];
        StoaLimit.Order memory o = lim.order(id);
        if (o.status != lim.OPEN()) return;
        bool buy = o.tokenIn == NATIVE;
        uint256 balBefore = buy ? tok.balanceOf(o.maker) : o.maker.balance;
        StoaRouter.Leg memory leg = StoaRouter.Leg({venue: address(buy ? buyAd : sellAd), isPool: false});
        StoaRouter.Leg memory none;
        vm.prank(byMaker ? o.maker : keeper);
        try lim.fill(id, NATIVE, leg, none) returns (uint256) {
            closed[id] = true;
            ++fills;
            uint256 balAfter = buy ? tok.balanceOf(o.maker) : o.maker.balance;
            if (balAfter - balBefore < o.minOut) ++underpaidFills;
        } catch {}
    }

    function moveMarket(uint256 buyRate, uint256 sellRate) external {
        buyAd.setRate(bound(buyRate, 900, 1100), 1);
        sellAd.setRate(1, bound(sellRate, 900, 1100));
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 minutes, 3 days));
    }

    function togglePause(bool on) external {
        if (on && !lim.paused()) {
            vm.prank(guardian);
            lim.pause();
        } else if (!on && lim.paused()) {
            vm.prank(gov);
            lim.unpause();
        }
    }

    /// @dev closed orders that are OPEN again (must stay 0)
    function reopened() external view returns (uint256 n) {
        for (uint256 i; i < ids.length; ++i) {
            if (closed[ids[i]] && lim.order(ids[i]).status == lim.OPEN()) ++n;
        }
    }
}

/// @notice StoaLimit holds exactly the deposits of open orders, its open list matches the orders, every fill pays
///         at least the order's minimum, and a closed order never reopens.
contract StoaLimitInvariantTest is StdInvariant, Test {
    StoaLimit lim;
    MockToken tok;
    LimitHandler h;

    function setUp() public {
        vm.warp(1_795_000_000);
        address gov = makeAddr("gov");
        address guardian = makeAddr("guardian");
        address keeper = makeAddr("keeper");
        MockWHYPE weth = new MockWHYPE();
        tok = new MockToken("TOK", 18);
        MakerRegistry reg = new MakerRegistry(gov, gov, 3 days);
        FeeDistributor fees = new FeeDistributor(gov, IMakerRegistry(address(reg)));
        StoaRouter router = new StoaRouter(
            gov, IFeeDistributor(address(fees)), address(weth), ISignatureTransfer(address(new MockPermit2())), 1 days
        );
        MockAdapter buyAd = new MockAdapter(1000, 1);
        MockAdapter sellAd = new MockAdapter(1, 1000);
        vm.startPrank(gov);
        router.addAdapter(address(buyAd));
        router.addAdapter(address(sellAd));
        fees.setNotifier(address(router), true);
        vm.stopPrank();
        tok.mint(address(buyAd), 1e30);
        weth.mint(address(sellAd), 1_000_000 ether);
        vm.deal(address(weth), 1_000_000 ether); // backs the minted WETH so the router can unwrap it
        lim = new StoaLimit(gov, router, guardian, keeper);

        h = new LimitHandler(lim, router, tok, buyAd, sellAd, gov, guardian, keeper);
        // every run starts with a buy and a sell order open, so fills and cancels are reachable from the first call
        h.createBuy(0, 1 ether, 95, 1 days);
        h.createSell(1, 1_000 ether, 95, 1 days);
        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](7);
        sel[0] = LimitHandler.createBuy.selector;
        sel[1] = LimitHandler.createSell.selector;
        sel[2] = LimitHandler.cancel.selector;
        sel[3] = LimitHandler.fill.selector;
        sel[4] = LimitHandler.moveMarket.selector;
        sel[5] = LimitHandler.warp.selector;
        sel[6] = LimitHandler.togglePause.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// @dev ETH and TOK held by StoaLimit equal the deposits of its open orders, to the wei
    function invariant_holdsExactlyOpenDeposits() public view {
        uint256 eth;
        uint256 tokens;
        uint256 n = h.idsLength();
        for (uint256 i; i < n; ++i) {
            StoaLimit.Order memory o = lim.order(h.ids(i));
            if (o.status != lim.OPEN()) continue;
            if (o.tokenIn == address(0)) eth += o.amountIn;
            else tokens += o.amountIn;
        }
        assertEq(address(lim).balance, eth, "ETH held != open ETH deposits");
        assertEq(tok.balanceOf(address(lim)), tokens, "TOK held != open TOK deposits");
    }

    /// @dev the open list, the per-maker counts and the order statuses agree
    function invariant_openListMatchesOrders() public view {
        uint256 open;
        uint256 n = h.idsLength();
        for (uint256 i; i < n; ++i) {
            if (lim.order(h.ids(i)).status == lim.OPEN()) ++open;
        }
        assertEq(lim.openLength(), open, "open list length");
        uint256 counted;
        for (uint256 i; i < 3; ++i) {
            uint256 c = lim.openCount(h.makers(i));
            assertLe(c, lim.MAX_OPEN_PER_MAKER(), "per-maker cap");
            counted += c;
        }
        assertEq(counted, open, "per-maker counts");
        uint256[] memory listed = lim.openIds(0, open + 1);
        assertEq(listed.length, open, "openIds length");
        for (uint256 i; i < listed.length; ++i) {
            assertEq(lim.order(listed[i]).status, lim.OPEN(), "closed order in the open list");
        }
    }

    /// @dev every fill paid at least the minimum, every cancel returned the whole deposit, nothing reopened
    function invariant_makersAreMadeWhole() public view {
        assertEq(h.underpaidFills(), 0, "a fill paid less than minOut, or a cancel returned less than the deposit");
        assertEq(h.reopened(), 0, "a closed order reopened");
    }
}
