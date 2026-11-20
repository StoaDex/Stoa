/** Gloam (gloam.trade): a separate app for private balances and payments. Its private swaps on Robinhood Chain release a
 *  private note, buy the output on a public pool through Gloam's own router, and return it as a new private note: the
 *  chain shows the tokens and amounts, not who swapped. Stoa does not run Gloam or route its swaps; it links there with
 *  the trade filled in (the user still reviews the quote and confirms in Gloam), after Stoa's own safety check.
 *  Symbols are the ones Gloam's docs (/docs/private-swaps) name for Robinhood Chain. */
const GLOAM_SYMBOLS: Record<string, string> = {
  USDG: "USDG", ETH: "ETH", WETH: "ETH", USDE: "USDe", U: "U", CBBTC: "cbBTC", VIRTUAL: "VIRTUAL", PONS: "PONS",
  CASHCAT: "CASHCAT", AI: "AI", ORBIO: "ORBIO", GLOAM: "GLOAM", SPY: "SPY", NVDA: "NVDA", TSLA: "TSLA", AAPL: "AAPL",
};

/** Gloam's symbol for a Robinhood Chain token, or null when Gloam's docs don't list it */
export function gloamSymbol(symbol: string): string | null {
  return GLOAM_SYMBOLS[symbol.replace(/^\$/, "").toUpperCase()] ?? null;
}

/** Gloam's Swap tab with a trade filled in: into `symbol`, from `fromSymbol` when Gloam lists it (else from USDG, or
 *  from ETH when the token is USDG). `amount` is the user's own amount of the from token; without one the link starts
 *  at a small default (0.05 ETH or 100 of a dollar token), never a number meant for another token. */
export function gloamSwapUrl(symbol: string, amount?: number, fromSymbol?: string): string | null {
  const to = gloamSymbol(symbol);
  if (!to) return null;
  const given = fromSymbol ? gloamSymbol(fromSymbol) : null;
  const from = given && given !== to ? given : to === "USDG" ? "ETH" : "USDG";
  const own = given === from && amount !== undefined && Number.isFinite(amount) && amount > 0;
  const amt = own ? amount : from === "ETH" ? 0.05 : 100;
  // chain: Robinhood Chain; p: Stoa's partner link code from Gloam's portal (public, it appears in every link), so swaps
  // that start here are counted to Stoa there. Left out until the code is set.
  return withCode(`https://www.gloam.trade/app/vault?tab=swap#from=${from}&to=${to}&amount=${amt}&chain=robinhood`);
}

function withCode(url: string) {
  const code = process.env.NEXT_PUBLIC_GLOAM_LINK_CODE;
  return code && /^[A-Za-z0-9_-]{8,40}$/.test(code) ? `${url}&p=${code}` : url;
}
