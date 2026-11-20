// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVenueAdapter} from "../../src/interfaces/IStoa.sol";

contract MockToken is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, uint8 d) ERC20(n, n) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev Fallback venue with a fixed rate: out = in * num / den.
contract MockAdapter is IVenueAdapter {
    uint256 public num;
    uint256 public den;
    bool public broken;

    constructor(uint256 num_, uint256 den_) {
        num = num_;
        den = den_;
    }

    function setRate(uint256 num_, uint256 den_) external {
        num = num_;
        den = den_;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function quote(address, address, uint256 amountIn) external view returns (uint256) {
        require(!broken, "broken");
        return amountIn * num / den;
    }

    function swap(address, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 out)
    {
        out = amountIn * num / den;
        require(out >= minOut, "slippage");
        IERC20(tokenOut).transfer(to, out);
    }
}

/// @dev WETH9-style wrapper for native HYPE, with a test mint.
contract MockWHYPE is ERC20 {
    constructor() ERC20("Wrapped HYPE", "WHYPE") {}

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amt) external {
        _burn(msg.sender, amt);
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "send");
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}

/// @dev Minimal Uniswap V2 pair: constant product with the 0.3% fee check, like the real one.
contract MockV2Pair {
    address public immutable token0;
    address public immutable token1;
    uint112 private r0;
    uint112 private r1;

    constructor(address a, address b) {
        (token0, token1) = a < b ? (a, b) : (b, a);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (r0, r1, 0);
    }

    function sync() public {
        r0 = uint112(IERC20(token0).balanceOf(address(this)));
        r1 = uint112(IERC20(token1).balanceOf(address(this)));
    }

    function swap(uint256 a0, uint256 a1, address to, bytes calldata) external {
        require(a0 > 0 || a1 > 0, "V2: OUT");
        if (a0 > 0) IERC20(token0).transfer(to, a0);
        if (a1 > 0) IERC20(token1).transfer(to, a1);
        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));
        uint256 in0 = b0 > r0 - a0 ? b0 - (r0 - a0) : 0;
        uint256 in1 = b1 > r1 - a1 ? b1 - (r1 - a1) : 0;
        require(in0 > 0 || in1 > 0, "V2: IN");
        require((b0 * 1000 - in0 * 3) * (b1 * 1000 - in1 * 3) >= uint256(r0) * r1 * 1_000_000, "V2: K");
        sync();
    }
}

/// @dev Minimal Uniswap V2 factory with a liquidity helper.
contract MockV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function addLiquidity(address a, address b, uint256 ra, uint256 rb) external returns (address pair) {
        pair = getPair[a][b];
        if (pair == address(0)) {
            pair = address(new MockV2Pair(a, b));
            getPair[a][b] = pair;
            getPair[b][a] = pair;
        }
        IERC20(a).transferFrom(msg.sender, pair, ra);
        IERC20(b).transferFrom(msg.sender, pair, rb);
        MockV2Pair(pair).sync();
    }

    function quote(address a, address b, uint256 amountIn) external view returns (uint256) {
        (uint112 x, uint112 y,) = MockV2Pair(getPair[a][b]).getReserves();
        (uint256 rin, uint256 rout) = a < b ? (uint256(x), uint256(y)) : (uint256(y), uint256(x));
        uint256 f = amountIn * 997;
        return f * rout / (rin * 1000 + f);
    }
}

/// @dev Attack: claims a great price and a big output, takes the input, pays nothing.
contract LyingPool {
    address public base;
    address public quote;
    bool public payHalf;

    constructor(address b, address q) {
        (base, quote) = (b, q);
    }

    function setPayHalf(bool v) external {
        payHalf = v;
    }

    function quoteOut(address, uint256 amountIn) external pure returns (uint256) {
        return amountIn * 1_000_000; // irresistible
    }

    function swap(address tokenIn, uint256 amountIn, uint256, address to, address) external returns (uint256) {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        if (payHalf) {
            address out = tokenIn == base ? quote : base;
            IERC20(out).transfer(to, 1);
        }
        return amountIn * 1_000_000;
    }
}

/// @dev Attack: takes only part of the input and leaves the rest stuck in the router.
contract SkimmingPool {
    address public base;
    address public quote;

    constructor(address b, address q) {
        (base, quote) = (b, q);
    }

    function quoteOut(address, uint256 amountIn) external pure returns (uint256) {
        return amountIn * 1_000_000;
    }

    function swap(address tokenIn, uint256 amountIn, uint256, address to, address) external returns (uint256) {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn / 2);
        address out = tokenIn == base ? quote : base;
        uint256 pay = IERC20(out).balanceOf(address(this));
        IERC20(out).transfer(to, pay);
        return pay;
    }
}

/// @dev Token that burns 1% on every transfer.
contract TaxToken is ERC20 {
    constructor() ERC20("TAX", "TAX") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function _update(address from, address to, uint256 v) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 tax = v / 100;
            super._update(from, address(0), tax);
            v -= tax;
        }
        super._update(from, to, v);
    }
}

/// @dev Minimal stand-in for Permit2 signature transfers: accepts any non-empty signature.
///      The real Permit2 signature check is covered by the Elysium fork test.
contract MockPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    mapping(address => mapping(uint256 => bool)) public used;

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata d,
        address owner,
        bytes calldata signature
    ) external {
        require(signature.length > 0, "sig");
        require(block.timestamp <= permit.deadline, "expired");
        require(d.requestedAmount <= permit.permitted.amount, "amount");
        require(!used[owner][permit.nonce], "nonce");
        used[owner][permit.nonce] = true;
        require(IERC20(permit.permitted.token).transferFrom(owner, d.to, d.requestedAmount), "transfer");
    }
}

/// @dev Accepts quotes whose bid and ask are within `maxDevBps` of a set mid price.
contract MockQuoteGuard {
    uint256 public mid;
    uint256 public maxDevBps;

    constructor(uint256 mid_, uint256 maxDevBps_) {
        mid = mid_;
        maxDevBps = maxDevBps_;
    }

    function check(address, address, uint128 bidPx, uint128 askPx) external view returns (bool) {
        uint256 lo = mid * (10_000 - maxDevBps) / 10_000;
        uint256 hi = mid * (10_000 + maxDevBps) / 10_000;
        return bidPx >= lo && askPx <= hi;
    }
}
