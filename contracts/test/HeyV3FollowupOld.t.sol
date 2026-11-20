// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {PoolKey, IPoolManager} from "../src/adapters/UniswapV4Adapter.sol";
import {UniswapV4AdapterV3Old} from "./old/UniswapV4AdapterV3Old.sol";
import {StoaRouter, ISignatureTransfer} from "../src/StoaRouter.sol";
import {IFeeDistributor} from "../src/interfaces/IStoa.sol";
import {SafetySim} from "../src/tools/SafetySim.sol";
import {MockToken, MockWHYPE} from "./mocks/Mocks.sol";
import {HeyLp, IPM} from "./HeyV3Gas.t.sol";
import {NoFees} from "./HeyV3FollowupFork.t.sol";

/// @notice The same safety-test measurement as HeyV3FollowupSafetyTest, against the adapter as it was at b0fd23b
///         (test/old/UniswapV4AdapterV3Old.sol is `git show b0fd23b:contracts/src/adapters/UniswapV4AdapterV3.sol`
///         with the contract renamed), to tell what the LowGas check changed.
contract HeyV3FollowupOldSafetyTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint160 constant MID = uint160(1) << 96;

    UniswapV4AdapterV3Old v3;
    StoaRouter router;
    MockWHYPE weth;
    MockToken tok;
    HeyLp lp;
    SafetySim sim;
    address gov = makeAddr("gov");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.etch(PM, vm.parseBytes(vm.trim(vm.readFile("test/data/poolmanager-4663-runtime.hex"))));
        weth = new MockWHYPE();
        tok = new MockToken("TOK", 18);
        lp = new HeyLp(IPM(PM));
        vm.deal(address(lp), 1e24);
        tok.mint(address(lp), 1e24);
        router = new StoaRouter(
            gov, IFeeDistributor(address(new NoFees())), address(weth), ISignatureTransfer(address(0)), 1 days
        );
        address[] memory hooks = new address[](1);
        v3 = new UniswapV4AdapterV3Old(IPoolManager(PM), address(weth), address(router), gov, hooks, keeper);
        vm.prank(gov);
        router.addAdapter(address(v3));
        PoolKey memory real = PoolKey(address(0), address(tok), 3000, 60, address(0));
        IPM(PM).initialize(real, MID);
        lp.modify(real, -887220, 887220, 1000e18);
        vm.prank(keeper);
        v3.register(real);
        sim = new SafetySim();
        vm.deal(address(sim), 10 ether);
    }

    function test_followup_old_safetySim_15M_bySlowKeys() public {
        for (uint24 i = 1; i <= 5; ++i) {
            PoolKey memory j = PoolKey(address(0), address(tok), 100 + i, 10, address(0));
            IPM(PM).initialize(j, MID);
            lp.modify(j, -1000, 1000, 2e18);
            vm.prank(keeper);
            v3.register(j);
            lp.modify(j, -1000, 1000, -2e18);
            uint256 snap = vm.snapshotState();
            vm.cool(PM);
            uint256 g = gasleft();
            SafetySim.Result memory r = sim.check{gas: 15_000_000}(router, address(tok), 0.001 ether);
            g -= gasleft();
            vm.revertToState(snap);
            console2.log("b0fd23b, slow keys / gas of the safety test:", i, g);
            console2.log("   buy ok / sell ok:", r.buyOk, r.sellOk);
        }
    }
}
