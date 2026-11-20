// Points season review (private): wallets whose swaps look like farming, for a human to look at before the board is
// trusted. Prints only; nothing is published or changed. Run from web/:
//   npx tsx --conditions=react-server scripts/points-review.mts
const { readSwaps } = await import("../lib/routerStats.ts");
const { review } = await import("../lib/pointsScore.ts");
const st = (await (await fetch("https://stoadex.com/api/v1/stocks")).json()) as { stocks: { address: string }[] };
const stocks = new Set(st.stocks.map((s) => s.address.toLowerCase()));
const flags = review(await readSwaps(), stocks);
if (!flags.length) console.log("No wallet flagged.");
for (const f of flags) console.log(`#${f.rank || "-"}  ${f.address}  ${f.points.toFixed(1)} pts\n   - ${f.flags.join("\n   - ")}`);
