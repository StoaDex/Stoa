// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StoaRouter} from "../../src/StoaRouter.sol";

/// @notice Builds swap params from the router's own quote, the way the web app does.
abstract contract RouterHelper is Test {
    function _params(StoaRouter r, address tin, address tout, uint256 amt, uint256 minOut, address to, address refr)
        internal
        returns (StoaRouter.SwapParams memory p)
    {
        StoaRouter.Quote memory q = r.quote(tin, tout, amt);
        p = StoaRouter.SwapParams({
            tokenIn: tin,
            tokenOut: tout,
            mid: q.mid,
            leg1: q.leg1,
            leg2: q.leg2,
            amountIn: amt,
            minOut: minOut,
            to: to,
            deadline: block.timestamp,
            referrer: refr
        });
    }

    /// @dev Quote, then swap as `from`. Use `_params` + `router.swap` directly when expecting a revert.
    function _swapAs(
        StoaRouter r,
        address from,
        address tin,
        address tout,
        uint256 amt,
        uint256 minOut,
        address to,
        address refr
    ) internal returns (uint256) {
        StoaRouter.SwapParams memory p = _params(r, tin, tout, amt, minOut, to, refr);
        vm.prank(from);
        return r.swap{value: tin == address(0) ? amt : 0}(p);
    }
}
