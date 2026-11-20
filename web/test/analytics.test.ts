import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsUrl } from "../lib/analyticsUrl";

const W = "0x5A63C75B38e7ee42220Cc3A57702E06D1D8903c9";
const TX = "0xf2658e034d01" + "ab".repeat(26);

test("analyticsUrl: no wallet address or transaction hash leaves the browser", () => {
  assert.equal(analyticsUrl(`https://stoadex.com/wrapped/${W}`), "https://stoadex.com/wrapped/[address]");
  assert.equal(analyticsUrl(`https://stoadex.com/swap/robinhood/${TX}`), "https://stoadex.com/swap/robinhood/[hash]");
  assert.equal(analyticsUrl(`https://stoadex.com/trade?ref=${W}`), "https://stoadex.com/trade?ref=1");
  assert.equal(analyticsUrl(`https://stoadex.com/trade?chain=robinhood&buy=0x13E6993417616De724F2b337D65063f229e96718&ref=${W}#x`), "https://stoadex.com/trade?chain=robinhood&ref=1");
  for (const u of [`https://stoadex.com/wrapped/${W}?ref=${W}`, `https://stoadex.com/portfolio?address=${W}`, `https://stoadex.com/x#${W}`])
    assert.ok(!analyticsUrl(u).toLowerCase().includes(W.slice(2, 12).toLowerCase()), u);
});

test("analyticsUrl: keeps what is worth counting", () => {
  assert.equal(analyticsUrl("https://stoadex.com/"), "https://stoadex.com/");
  assert.equal(analyticsUrl("https://stoadex.com/trade?chain=elysium&utm_source=x&utm_campaign=hey"), "https://stoadex.com/trade?chain=elysium&utm_source=x&utm_campaign=hey");
  assert.equal(analyticsUrl("https://stoadex.com/tokens/robinhood/0x13E6993417616De724F2b337D65063f229e96718"), "https://stoadex.com/tokens/robinhood/0x13E6993417616De724F2b337D65063f229e96718");
  assert.equal(analyticsUrl("https://stoadex.com/swap/robinhood"), "https://stoadex.com/swap/robinhood");
});
