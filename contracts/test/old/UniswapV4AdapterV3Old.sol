// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IVenueAdapter} from "../../src/interfaces/IStoa.sol";
import {PoolKey, V4SwapParams, IPoolManager, IWETH} from "../../src/adapters/UniswapV4Adapter.sol";

/// @title UniswapV4AdapterV3
/// @notice Fills swaps for StoaRouter on Uniswap V4 pools, including native-ETH pools (the router hands over WETH;
///         the adapter unwraps and wraps around the PoolManager) and launchpad pools with allowlisted hooks.
/// @dev Changes from UniswapV4AdapterV2, following Hey Research Lab's re-test of GHSA-cv5f-wmmh-wcrv:
///      - No eviction. A pair holds at most MAX_KEYS pool keys; registering into a full pair reverts (Full), whoever
///        calls. In V2 a new key replaced the one with the least in-range liquidity, which a planted pool could use to
///        push out a pair's real pool.
///      - Pinned keys. The owner (Stoa's 48h timelock) can pin a registered key, such as $STOA's canonical pool; the
///        keeper cannot remove a pinned key, only the owner can.
///      - Hook allowlist kept by the owner. It starts with the hooks given at deployment and only the owner (the
///        timelock) can change it, so a reviewed hook (for example the Fables ramps) can be added without a new
///        adapter. A key whose hook is taken off the list is skipped at once by quote and swap.
///      Swapping is unchanged from V2.
contract UniswapV4AdapterV3Old is IVenueAdapter, Ownable2Step {
    using SafeERC20 for IERC20;

    uint160 internal constant MIN_SQRT_PRICE = 4295128739;
    uint160 internal constant MAX_SQRT_PRICE = 1461446703485210103287233400603844494775084017;
    bytes32 internal constant POOLS_SLOT = bytes32(uint256(6)); // v4-core PoolManager `_pools` mapping
    uint256 public constant MAX_KEYS = 6;
    address internal constant NATIVE = address(0);

    IPoolManager public immutable poolManager;
    address public immutable whype;
    address public immutable stoaRouter;
    mapping(address hooks => bool) public hookAllowed;
    mapping(bytes32 pair => PoolKey[]) internal _keys;
    mapping(bytes32 poolId => bool) public pinned;
    address public keeper;

    event Registered(bytes32 indexed poolId, address currency0, address currency1, address hooks);
    event Unregistered(bytes32 indexed poolId);
    event PinSet(bytes32 indexed poolId, bool pinned);
    event HookSet(address indexed hooks, bool allowed);
    event KeeperSet(address keeper);

    error OnlyRouter();
    error OnlyPoolManager();
    error NoPath();
    error Slippage();
    error Partial();
    error BadConfig();
    error BadKey();
    error HookNotAllowed();
    error NotInitialized();
    error Known();
    error Full();
    error NotFound();
    error NotKeeper();
    error PinnedKey();
    error Simulated(uint256 inUsed, uint256 out);

    constructor(
        IPoolManager pm_,
        address whype_,
        address stoaRouter_,
        address owner_,
        address[] memory hooks_,
        address keeper_
    ) Ownable(owner_) {
        if (address(pm_) == address(0) || whype_ == address(0) || stoaRouter_ == address(0)) {
            revert BadConfig();
        }
        poolManager = pm_;
        whype = whype_;
        stoaRouter = stoaRouter_;
        keeper = keeper_;
        emit KeeperSet(keeper_);
        for (uint256 i; i < hooks_.length; ++i) {
            hookAllowed[hooks_[i]] = true;
            emit HookSet(hooks_[i], true);
        }
    }

    /// @dev Native ETH only arrives from the PoolManager (take) or WETH (withdraw).
    receive() external payable {
        if (msg.sender != address(poolManager) && msg.sender != whype) revert OnlyPoolManager();
    }

    // ================================================================ registry

    function poolId(PoolKey memory key) public pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    /// @notice Pool keys registered for a pair. Use WETH for native ETH; native and WETH pools are listed together.
    function keysFor(address a, address b) external view returns (PoolKey[] memory) {
        return _keys[_pair(a, b)];
    }

    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeper && msg.sender != owner()) revert NotKeeper();
        _;
    }

    /// @notice The keeper role: may register keys and remove unpinned ones. Zero turns it off (the owner still can).
    function setKeeper(address k) external onlyOwner {
        keeper = k;
        emit KeeperSet(k);
    }

    /// @notice Allow or disallow a hooks contract (owner, i.e. the timelock). Keys with a disallowed hook stop routing.
    function setHookAllowed(address hooks, bool allowed) external onlyOwner {
        hookAllowed[hooks] = allowed;
        emit HookSet(hooks, allowed);
    }

    /// @notice Register an initialized V4 pool so the router can use it. Never replaces a key: a full pair reverts.
    function register(PoolKey calldata key) external onlyKeeperOrOwner {
        if (key.currency0 >= key.currency1) revert BadKey();
        if (!hookAllowed[key.hooks]) revert HookNotAllowed();
        address a = _canon(key.currency0);
        address b = _canon(key.currency1);
        if (a == b) revert BadKey();
        bytes32 id = poolId(key);
        if (_sqrtPrice(id) == 0) revert NotInitialized();
        PoolKey[] storage list = _keys[_pair(a, b)];
        for (uint256 i; i < list.length; ++i) {
            if (poolId(list[i]) == id) revert Known();
        }
        if (list.length >= MAX_KEYS) revert Full();
        list.push(key);
        emit Registered(id, key.currency0, key.currency1, key.hooks);
    }

    /// @notice Pin or unpin a registered key (owner, i.e. the timelock). The keeper cannot remove a pinned key.
    function setPinned(PoolKey calldata key, bool on) external onlyOwner {
        (bool found,) = _find(key);
        if (!found) revert NotFound();
        bytes32 id = poolId(key);
        pinned[id] = on;
        emit PinSet(id, on);
    }

    /// @notice Remove a key. The keeper can remove unpinned keys; the owner any key. Removing only reduces routing.
    function unregister(PoolKey calldata key) external onlyKeeperOrOwner {
        bytes32 id = poolId(key);
        if (pinned[id] && msg.sender != owner()) revert PinnedKey();
        (bool found, uint256 i) = _find(key);
        if (!found) revert NotFound();
        PoolKey[] storage list = _keys[_pair(_canon(key.currency0), _canon(key.currency1))];
        list[i] = list[list.length - 1];
        list.pop();
        if (pinned[id]) {
            pinned[id] = false;
            emit PinSet(id, false);
        }
        emit Unregistered(id);
    }

    // ================================================================ adapter

    function quote(address tokenIn, address tokenOut, uint256 amountIn) external returns (uint256 amountOut) {
        (, amountOut) = _best(tokenIn, tokenOut, amountIn);
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 amountOut)
    {
        if (msg.sender != stoaRouter) revert OnlyRouter();
        (uint256 idx, uint256 out) = _best(tokenIn, tokenOut, amountIn);
        if (out == 0) revert NoPath();
        PoolKey memory key = _keys[_pair(tokenIn, tokenOut)][idx];
        bytes memory res = poolManager.unlock(abi.encode(false, key, _zeroForOne(key, tokenIn), amountIn));
        amountOut = abi.decode(res, (uint256));
        address outCurrency = _zeroForOne(key, tokenIn) ? key.currency1 : key.currency0;
        if (outCurrency == NATIVE) IWETH(whype).deposit{value: amountOut}();
        IERC20(tokenOut).safeTransfer(to, amountOut);
        if (amountOut < minOut) revert Slippage();
    }

    /// @dev Called by the PoolManager inside `unlock`. Simulations revert with the result; real swaps settle.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        (bool isQuote, PoolKey memory key, bool zeroForOne, uint256 amountIn) =
            abi.decode(data, (bool, PoolKey, bool, uint256));
        int256 delta = poolManager.swap(
            key,
            V4SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 d0 = int128(delta >> 128);
        int128 d1 = int128(delta);
        (int128 dIn, int128 dOut) = zeroForOne ? (d0, d1) : (d1, d0);
        uint256 inUsed = dIn < 0 ? uint256(uint128(-dIn)) : 0;
        uint256 out = dOut > 0 ? uint256(uint128(dOut)) : 0;
        if (isQuote) revert Simulated(inUsed, out);
        if (inUsed != amountIn) revert Partial();

        address cIn = zeroForOne ? key.currency0 : key.currency1;
        address cOut = zeroForOne ? key.currency1 : key.currency0;
        if (cIn == NATIVE) {
            IWETH(whype).withdraw(amountIn);
            poolManager.settle{value: amountIn}();
        } else {
            poolManager.sync(cIn);
            IERC20(cIn).safeTransfer(address(poolManager), amountIn);
            poolManager.settle();
        }
        poolManager.take(cOut, address(this), out);
        return abi.encode(out);
    }

    // ================================================================ internal

    function _best(address a, address b, uint256 amountIn) private returns (uint256 idx, uint256 out) {
        if (a == b || amountIn == 0 || amountIn > uint256(uint128(type(int128).max))) return (0, 0);
        PoolKey[] storage list = _keys[_pair(a, b)];
        for (uint256 i; i < list.length; ++i) {
            PoolKey memory key = list[i];
            if (!hookAllowed[key.hooks]) continue; // a hook taken off the list stops routing at once
            try poolManager.unlock(abi.encode(true, key, _zeroForOne(key, a), amountIn)) {
            // a simulation always reverts
            }
            catch (bytes memory reason) {
                if (reason.length != 68 || bytes4(reason) != Simulated.selector) continue;
                (uint256 inUsed, uint256 o) = abi.decode(_tail(reason), (uint256, uint256));
                if (inUsed == amountIn && o > out) (idx, out) = (i, o);
            }
        }
    }

    function _find(PoolKey calldata key) private view returns (bool, uint256) {
        PoolKey[] storage list = _keys[_pair(_canon(key.currency0), _canon(key.currency1))];
        bytes32 id = poolId(key);
        for (uint256 i; i < list.length; ++i) {
            if (poolId(list[i]) == id) return (true, i);
        }
        return (false, 0);
    }

    function _zeroForOne(PoolKey memory key, address tokenIn) private view returns (bool) {
        return _canon(key.currency0) == tokenIn;
    }

    function _canon(address c) private view returns (address) {
        return c == NATIVE ? whype : c;
    }

    function _pair(address a, address b) private pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _stateSlot(bytes32 id) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(id, POOLS_SLOT));
    }

    function _sqrtPrice(bytes32 id) private view returns (uint160) {
        return uint160(uint256(poolManager.extsload(_stateSlot(id))));
    }

    function _tail(bytes memory r) private pure returns (bytes memory t) {
        t = new bytes(r.length - 4);
        for (uint256 i; i < t.length; ++i) {
            t[i] = r[i + 4];
        }
    }
}
