import { existsSync } from "node:fs";
import { formatUnits, parseGwei, type Address, type Hash } from "viem";
import type { Config } from "./config.js";
import { makeClients, poolAbi, registryAbi, erc20Abi } from "./chain.js";
import { buildQuote, fromPx, inventoryValue, VolTracker, type Decimals, type Inventory, type MakerQuote } from "./quote.js";
import { RiskGuard } from "./risk.js";
import type { PriceFeed } from "./price.js";

type Log = Pick<Console, "info" | "warn" | "error">;

export class MakerBot {
  private cl;
  private base!: Address;
  private quote!: Address;
  private dec!: Decimals;
  private syms = { base: "BASE", quote: "QUOTE" };
  private validBlocks = 1;
  private inv: Inventory = { baseRaw: 0n, quoteRaw: 0n };
  private nonce = 0;
  private pending = 0;
  private busy = false;
  private quoteLive = false;
  private lastTickTs = 0;
  private baseFee = 0n;
  private unwatch?: () => void;
  private vol = new VolTracker();
  private risk: RiskGuard;
  readonly stats = {
    started: new Date().toISOString(),
    block: 0n as bigint | number,
    mid: 0,
    lastQuote: null as null | { bid: number; ask: number; bidSize: string; askSize: string; halfSpreadBps: number; invRatio: number },
    lastTx: "" as string,
    sent: 0,
    failed: 0,
    skipped: "" as string,
    pnlTodayUsd: 0,
    equityUsd: 0,
    halted: false,
    haltReason: "",
  };

  constructor(private c: Config, private feed: PriceFeed, private log: Log = console) {
    this.cl = makeClients(c);
    this.risk = new RiskGuard(c);
  }

  async init() {
    const { pub, account } = this.cl;
    const pool = this.c.pool;
    const [base, quote, registry, maxValid] = await Promise.all([
      pub.readContract({ address: pool, abi: poolAbi, functionName: "base" }),
      pub.readContract({ address: pool, abi: poolAbi, functionName: "quote" }),
      pub.readContract({ address: pool, abi: poolAbi, functionName: "registry" }),
      pub.readContract({ address: pool, abi: poolAbi, functionName: "maxValidBlocks" }),
    ]);
    this.base = base;
    this.quote = quote;
    const [bd, qd, bs, qs] = await Promise.all([
      pub.readContract({ address: base, abi: erc20Abi, functionName: "decimals" }),
      pub.readContract({ address: quote, abi: erc20Abi, functionName: "decimals" }),
      pub.readContract({ address: base, abi: erc20Abi, functionName: "symbol" }),
      pub.readContract({ address: quote, abi: erc20Abi, functionName: "symbol" }),
    ]);
    this.dec = { base: bd, quote: qd };
    this.syms = { base: bs, quote: qs };
    this.validBlocks = Math.min(this.c.validBlocks, Number(maxValid));

    if (!this.c.dryRun) {
      const active = await pub.readContract({ address: registry, abi: registryAbi, functionName: "isActiveMaker", args: [pool, account.address] });
      if (!active) throw new Error(`maker ${account.address} is not approved or not bonded for pool ${pool}`);
      this.nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
    }
    await this.refreshInventory();
    await this.refreshBaseFee();
    this.log.info(`[bot] pool ${pool} ${bs}/${qs}, maker ${account.address}, validBlocks=${this.validBlocks}${this.c.dryRun ? " (DRY RUN)" : ""}`);
  }

  start() {
    this.unwatch = this.cl.pub.watchBlockNumber({
      emitOnBegin: true,
      pollingInterval: this.c.pollMs,
      onBlockNumber: (bn) => void this.onBlock(bn),
      onError: (e) => this.log.warn(`[bot] block watch error: ${e.message}`),
    });
  }

  async stop(reason: string) {
    this.unwatch?.();
    this.log.warn(`[bot] stopping: ${reason}`);
    await this.cancel(true);
  }

  private async onBlock(bn: bigint) {
    this.stats.block = Number(bn);
    if (this.busy) return;
    this.busy = true;
    try {
      void this.refreshInventory();
      if (Number(bn) % 20 === 0) void this.refreshBaseFee();

      if (existsSync(this.c.killFile)) {
        await this.stop(`kill file ${this.c.killFile} found`);
        process.exit(0);
      }
      if (this.risk.halted) return this.skip(`halted: ${this.risk.haltReason}`);

      const now = Date.now();
      const tick = this.feed.latest();
      const pv = this.risk.checkPrice(tick?.mid ?? 0, tick?.ts ?? 0, now);
      if (!pv.ok) return this.skip(pv.reason, true);
      const mid = tick!.mid;
      this.stats.mid = mid;
      if (tick!.ts !== this.lastTickTs) {
        this.vol.update(mid);
        this.lastTickTs = tick!.ts;
      }

      const v = inventoryValue(this.inv, mid, this.dec);
      this.stats.equityUsd = v.total;
      const rv = this.risk.checkPnl(v.total, now);
      this.stats.pnlTodayUsd = this.risk.pnlToday(v.total);
      if (!rv.ok) {
        this.stats.halted = true;
        this.stats.haltReason = rv.reason;
        this.log.error(`[risk] ${rv.reason} — halting`);
        return this.skip(rv.reason, true);
      }

      const q = buildQuote(mid, this.vol.bps(), this.inv, this.dec, this.c);
      if (q.bidSize === 0n && q.askSize === 0n) return this.skip("no inventory to quote", true);
      this.record(q);

      if (this.c.dryRun) {
        if (Number(bn) % 10 === 0) this.log.info(`[dry] ${this.describe(q)}`);
        return;
      }
      if (this.pending >= this.c.maxPendingTx) return this.skip("too many pending tx");
      await this.send("setQuote", [q.bidPx, q.askPx, q.bidSize, q.askSize, this.validBlocks]);
      this.quoteLive = true;
      this.stats.skipped = "";
    } catch (e) {
      this.log.error(`[bot] block ${bn}: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private skip(reason: string, cancel = false) {
    if (this.stats.skipped !== reason) this.log.warn(`[bot] not quoting: ${reason}`);
    this.stats.skipped = reason;
    if (cancel) void this.cancel();
  }

  /** Pull the live quote. Quotes also expire on their own after validBlocks. */
  private async cancel(force = false) {
    if (this.c.dryRun || (!this.quoteLive && !force)) return;
    this.quoteLive = false;
    try {
      await this.send("cancelQuote", [], true);
    } catch (e) {
      this.log.error(`[bot] cancel failed: ${(e as Error).message}`);
    }
  }

  private async send(fn: "setQuote" | "cancelQuote", args: readonly unknown[], wait = false) {
    const { wallet, pub, account } = this.cl;
    const prio = parseGwei(String(this.c.priorityFeeGwei));
    const nonce = this.nonce++;
    this.pending++;
    let hash: Hash;
    try {
      hash = await wallet.writeContract({
        address: this.c.pool,
        abi: poolAbi,
        functionName: fn,
        args: args as never,
        account,
        chain: this.cl.chain,
        nonce,
        gas: this.c.gasLimit,
        maxPriorityFeePerGas: prio,
        maxFeePerGas: this.baseFee * 2n + prio,
      });
    } catch (e) {
      this.pending--;
      this.stats.failed++;
      this.nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
      throw e;
    }
    this.stats.sent++;
    this.stats.lastTx = hash;
    const done = pub
      .waitForTransactionReceipt({ hash, pollingInterval: this.c.pollMs, timeout: 30_000 })
      .then((r) => { if (r.status !== "success") { this.stats.failed++; this.log.warn(`[bot] ${fn} reverted ${hash}`); } })
      .catch((e) => { this.stats.failed++; this.log.warn(`[bot] ${fn} receipt: ${e.message}`); })
      .finally(() => { this.pending--; });
    if (wait) await done;
  }

  private async refreshInventory() {
    const { pub } = this.cl;
    const [b, q] = await Promise.all([
      pub.readContract({ address: this.base, abi: erc20Abi, functionName: "balanceOf", args: [this.c.pool] }),
      pub.readContract({ address: this.quote, abi: erc20Abi, functionName: "balanceOf", args: [this.c.pool] }),
    ]);
    this.inv = { baseRaw: b, quoteRaw: q };
  }

  private async refreshBaseFee() {
    const blk = await this.cl.pub.getBlock({ blockTag: "latest" });
    this.baseFee = blk.baseFeePerGas ?? 0n;
  }

  private record(q: MakerQuote) {
    this.stats.lastQuote = {
      bid: fromPx(q.bidPx, this.dec),
      ask: fromPx(q.askPx, this.dec),
      bidSize: formatUnits(q.bidSize, this.dec.base),
      askSize: formatUnits(q.askSize, this.dec.base),
      halfSpreadBps: Number(q.halfSpreadBps.toFixed(2)),
      invRatio: Number(q.invRatio.toFixed(3)),
    };
  }

  private describe(q: MakerQuote) {
    const s = this.stats.lastQuote!;
    return `mid ${this.stats.mid} | bid ${s.bid} x ${s.bidSize} ${this.syms.base} | ask ${s.ask} x ${s.askSize} | half-spread ${s.halfSpreadBps} bps | base share ${s.invRatio}`;
  }
}
