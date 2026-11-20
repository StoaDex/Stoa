import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, type Address, type Hex } from "viem";

/** Adding venue adapters to a router whose setup is locked and whose owner is the 48h timelock (Safe as proposer
 *  and executor). Mirrors contracts/script/VenuePackageRobinhood.sol, which the fork test runs through the real Safe:
 *    A = router.propose(false, adapter) for each adapter, after the timelock's minimum delay
 *    B = router.execute(false, adapter) for each adapter, after min delay + router delay + 1h, with A as predecessor
 *  Round 1: one Safe transaction schedules A and B. Round 2: the Safe executes A. Round 3: the Safe executes B. */
export const ZERO32 = `0x${"00".repeat(32)}` as Hex;
export const MARGIN = 3600n;

export const routerGovAbi = parseAbi([
  "function propose(bool pool, address venue)",
  "function execute(bool pool, address venue)",
  "function proposalId(bool pool, address venue) pure returns (bytes32)",
  "function pending(bytes32 id) view returns (uint256)",
  "function isAdapter(address) view returns (bool)",
  "function delay() view returns (uint256)",
]);

export const timelockBatchAbi = parseAbi([
  "function getMinDelay() view returns (uint256)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) payable",
]);

export interface BatchOp { targets: Address[]; values: bigint[]; payloads: Hex[]; predecessor: Hex; salt: Hex }

/** TimelockController.hashOperationBatch */
export const opId = (o: BatchOp): Hex =>
  keccak256(encodeAbiParameters(
    [{ type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" }],
    [o.targets, o.values, o.payloads, o.predecessor, o.salt],
  ));

export function venueOps(router: Address, adapters: Address[]): { a: BatchOp; b: BatchOp } {
  const pay = (fn: "propose" | "execute") => adapters.map((v) => encodeFunctionData({ abi: routerGovAbi, functionName: fn, args: [false, v] }));
  const base = { targets: adapters.map(() => router), values: adapters.map(() => 0n), salt: ZERO32 };
  const a: BatchOp = { ...base, payloads: pay("propose"), predecessor: ZERO32 };
  const b: BatchOp = { ...base, payloads: pay("execute"), predecessor: opId(a) };
  return { a, b };
}

const args = (o: BatchOp) => [o.targets, o.values, o.payloads, o.predecessor, o.salt] as const;

/** Round 1: both schedules in one Safe transaction (the admin page batches them through MultiSendCallOnly). */
export const scheduleCalls = (timelock: Address, a: BatchOp, b: BatchOp, minDelay: bigint, routerDelay: bigint) => [
  { to: timelock, data: encodeFunctionData({ abi: timelockBatchAbi, functionName: "scheduleBatch", args: [...args(a), minDelay] }) },
  { to: timelock, data: encodeFunctionData({ abi: timelockBatchAbi, functionName: "scheduleBatch", args: [...args(b), minDelay + routerDelay + MARGIN] }) },
];

/** Rounds 2 and 3 */
export const executeCall = (timelock: Address, o: BatchOp) =>
  ({ to: timelock, data: encodeFunctionData({ abi: timelockBatchAbi, functionName: "executeBatch", args: args(o) }) });
