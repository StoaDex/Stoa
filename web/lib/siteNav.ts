/** Every page in four groups: the header menu, the More page and the footer read the same list. */
export const NAV_GROUPS: { h: string; items: [string, string][] }[] = [
  { h: "Trade", items: [["/trade", "Trade"], ["/bridge", "Bridge in"], ["/stocks", "Stocks"], ["/tokens", "Tokens"], ["/launches", "Launches"], ["/pools", "Pools"], ["/cover", "Rug Cover"], ["/check", "Token check"], ["/pay", "Stoa Pay"]] },
  { h: "$STOA & you", items: [["/token", "$STOA"], ["/spotlight", "Spotlight"], ["/projects", "For token projects"], ["/earn", "Earn"], ["/points", "Points"], ["/portfolio", "Portfolio"], ["/wrapped", "Wrapped"], ["/referrals", "Referrals"]] },
  { h: "Learn", items: [["/start", "Start here"], ["/docs", "Docs"], ["/guides", "Community guides"], ["/stats", "Stats"], ["/weekly", "This week"], ["/report", "State of Robinhood Chain"], ["/changelog", "Changelog"], ["/", "Walk the Stoa"], ["/build", "Integrate"], ["/makers", "Market makers"], ["/agents", "For AI agents"], ["/curators", "Curators"]] },
  { h: "Trust", items: [["/security", "Security status"], ["/status", "System status"], ["/open", "Open source & data"], ["/docs/admin", "Admin & security"], ["/docs/bug-bounty", "Security reports"], ["/docs/terms-privacy", "Terms & privacy"], ["/press", "Press kit"]] },
];

export const SOCIALS: [string, string][] = [
  ["https://x.com/StoaDEX", "X · @StoaDEX"],
  ["https://t.me/StoaDex", "Telegram · announcements"],
  ["https://t.me/StoaDexChat", "Telegram · community chat"],
  ["https://github.com/StoaDex/Stoa", "GitHub · source code"],
  ["https://www.coingecko.com/en/coins/stoa", "CoinGecko · $STOA"],
];
