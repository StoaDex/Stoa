import { concatHex, encodeFunctionData, encodePacked, pad, parseAbi, size, type Address, type Hex } from "viem";

/** Minimal Safe v1.3.0 support for the admin console. Signers approve a transaction on-chain with `approveHash`;
 *  the signer who completes the threshold executes it. No off-chain signature collection is needed. */
export const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function approvedHashes(address owner, bytes32 hash) view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function approveHash(bytes32 hashToApprove)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
]);

/** OpenZeppelin TimelockController (proposer and executor: the admin Safe). */
export const timelockAbi = parseAbi([
  "function getMinDelay() view returns (uint256)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function hashOperation(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) pure returns (bytes32)",
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt) payable",
]);

/** Safe's MultiSendCallOnly v1.3.0 on Elysium, used to batch several calls into one Safe transaction. */
export const MULTISEND = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D" as Address;
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);

export interface SafeCall { to: Address; data: Hex; operation: 0 | 1 }

/** One call as is, several calls through MultiSendCallOnly (delegatecall). */
export function batch(calls: { to: Address; data: Hex }[]): SafeCall {
  if (calls.length === 1) return { ...calls[0], operation: 0 };
  const packed = concatHex(calls.map((c) => encodePacked(["uint8", "address", "uint256", "uint256", "bytes"], [0, c.to, 0n, BigInt(size(c.data)), c.data])));
  return { to: MULTISEND, data: encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [packed] }), operation: 1 };
}

/** "Pre-approved" signatures (v = 1) for the given owners, sorted by address as Safe requires. The caller of
 *  execTransaction counts as approved without an on-chain approveHash. */
export function approvedSignatures(owners: Address[]): Hex {
  const sorted = [...owners].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  return concatHex(sorted.map((o) => concatHex([pad(o, { size: 32 }), pad("0x0", { size: 32 }), "0x01"])));
}
