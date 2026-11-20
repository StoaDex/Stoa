/** Risk checks. Each check says whether the bot may quote right now. */

export interface RiskParams {
  maxPriceAgeMs: number;
  jumpBps: number;
  cooldownMs: number;
  maxDailyLossUsd: number;
}

export type Verdict = { ok: true } | { ok: false; reason: string; halt?: boolean };

export class RiskGuard {
  private lastMid?: number;
  private coolUntil = 0;
  private dayKey = "";
  private dayStartEquity = 0;
  halted = false;
  haltReason = "";

  constructor(private p: RiskParams) {}

  /** Price freshness and sudden jumps. A jump starts a cooldown. */
  checkPrice(mid: number, priceTs: number, now: number): Verdict {
    if (!(mid > 0)) return { ok: false, reason: "no price" };
    if (now - priceTs > this.p.maxPriceAgeMs) return { ok: false, reason: `price stale ${now - priceTs}ms` };
    if (this.lastMid !== undefined) {
      const moveBps = Math.abs(mid / this.lastMid - 1) * 10_000;
      if (moveBps > this.p.jumpBps) this.coolUntil = now + this.p.cooldownMs;
    }
    this.lastMid = mid;
    if (now < this.coolUntil) return { ok: false, reason: "cooldown after price jump" };
    return { ok: true };
  }

  /** Mark-to-market loss since the start of the UTC day. Breaching it halts the bot until restart. */
  checkPnl(equityUsd: number, now: number): Verdict {
    const key = new Date(now).toISOString().slice(0, 10);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayStartEquity = equityUsd;
    }
    const loss = this.dayStartEquity - equityUsd;
    if (loss > this.p.maxDailyLossUsd) {
      this.halted = true;
      this.haltReason = `daily loss ${loss.toFixed(2)} > ${this.p.maxDailyLossUsd}`;
      return { ok: false, reason: this.haltReason, halt: true };
    }
    return { ok: true };
  }

  pnlToday(equityUsd: number): number {
    return equityUsd - this.dayStartEquity;
  }
}
