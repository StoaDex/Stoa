// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

interface ISafeT {
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function nonce() external view returns (uint256);
    function approveHash(bytes32 hash) external;
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 nonce_
    ) external view returns (bytes32);
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata signatures
    ) external payable returns (bool);
}

/// @notice Runs a transaction through the live 2-of-3 Safe the way /admin does: signer 1 approveHash, signer 2
///         execTransaction with both "pre-approved" signatures.
abstract contract SafeTestHelper is Test {
    function _safeExec(address safeAddr, address to, bytes memory data, uint8 operation) internal {
        ISafeT safe = ISafeT(safeAddr);
        address[] memory owners = safe.getOwners();
        assertEq(safe.getThreshold(), 2);
        bytes32 h = safe.getTransactionHash(to, 0, data, operation, 0, 0, 0, address(0), address(0), safe.nonce());
        (address s1, address s2) = (owners[0], owners[1]); // owner wallet and the Elysium deployer
        vm.prank(s1);
        safe.approveHash(h);
        (address lo, address hi) = s1 < s2 ? (s1, s2) : (s2, s1);
        bytes memory sigs = abi.encodePacked(
            bytes32(uint256(uint160(lo))), bytes32(0), uint8(1), bytes32(uint256(uint160(hi))), bytes32(0), uint8(1)
        );
        vm.prank(s2);
        assertTrue(safe.execTransaction(to, 0, data, operation, 0, 0, 0, address(0), payable(address(0)), sigs));
    }
}
