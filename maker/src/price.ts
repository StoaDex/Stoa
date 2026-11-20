import { readFileSync, existsSync } from "node:fs";

export interface PriceTick {
  mid: number;
  ts: number; // local receive time, ms
}
export interface PriceFeed {
  start(): Promise<void>;
  latest(): PriceTick | undefined;
  stop(): void;
}

type Level = { px: string; sz: string };

function midFromBook(levels: [Level[], Level[]] | undefined): number | undefined {
  const bid = levels?.[0]?.[0]?.px;
  const ask = levels?.[1]?.[0]?.px;
  if (!bid || !ask) return undefined;
  const b = Number(bid), a = Number(ask);
  return b > 0 && a > 0 && a >= b ? (a + b) / 2 : undefined;
}

/**
 * Mid price of a Hyperliquid book. WebSocket first (l2Book stream); while the socket is down it polls
 * the HTTP info endpoint once a second. Later this can be swapped for the Elysium HyperCore precompile.
 */
export class HyperliquidFeed implements PriceFeed {
  private tick?: PriceTick;
  private ws?: WebSocket;
  private stopped = false;
  private wsUp = false;
  private pollTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private backoff = 500;

  constructor(private coin: string, private httpUrl: string, private wsUrl: string, private log = console) {}

  async start() {
    this.connect();
    this.pollTimer = setInterval(() => { if (!this.wsUp) void this.poll(); }, 1000);
    await this.poll();
  }

  latest() {
    return this.tick;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearInterval(this.pingTimer);
    this.ws?.close();
  }

  private connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.wsUp = true;
      this.backoff = 500;
      ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "l2Book", coin: this.coin } }));
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ method: "ping" })), 30_000);
      this.log.info(`[price] websocket connected (${this.coin})`);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.channel === "l2Book" && msg.data?.coin === this.coin) {
          const mid = midFromBook(msg.data.levels);
          if (mid) this.tick = { mid, ts: Date.now() };
        }
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => {
      this.wsUp = false;
      if (this.stopped) return;
      this.log.warn(`[price] websocket closed, retrying in ${this.backoff}ms`);
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 15_000);
    };
    ws.onerror = () => ws.close();
  }

  private async poll() {
    try {
      const r = await fetch(this.httpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin: this.coin }),
        signal: AbortSignal.timeout(2000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const mid = midFromBook(j?.levels);
      if (mid) this.tick = { mid, ts: Date.now() };
    } catch (e) {
      this.log.warn(`[price] http poll failed: ${(e as Error).message}`);
    }
  }
}

/** Fixed price for dry runs and local tests. If MID_FILE exists, its number overrides the price live. */
export class StaticFeed implements PriceFeed {
  constructor(private mid: number, private midFile?: string) {}
  async start() {}
  stop() {}
  latest(): PriceTick | undefined {
    let mid = this.mid;
    if (this.midFile && existsSync(this.midFile)) {
      const v = Number(readFileSync(this.midFile, "utf8").trim());
      if (v > 0) mid = v;
    }
    return mid > 0 ? { mid, ts: Date.now() } : undefined;
  }
}

export { midFromBook };
