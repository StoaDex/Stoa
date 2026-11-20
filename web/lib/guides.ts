/** Community guides from the #StoaGuide contest (17-18 Nov 2026), picked for clarity, accuracy and usefulness for a
 *  new user. Written by users, not by Stoa: each links to the author's own post on X. */

export type Guide = { handle: string; title: string; why: string; url?: string; badge?: "1st" | "2nd" | "3rd" };
export type GuideGroup = { id: string; h: string; intro: string; guides: Guide[] };

const post = (handle: string, id: string) => `https://x.com/${handle}/status/${id}`;

export const GUIDES: GuideGroup[] = [
  {
    id: "start", h: "Start here", intro: "Full walkthroughs of Stoa on Robinhood Chain, from connecting a wallet to every tool.",
    guides: [
      { handle: "Ifeanyi_gmi", badge: "1st", title: "All four tools, end to end", why: "A swap, a safety check, a stock token and a limit order, each shown on screen.", url: post("Ifeanyi_gmi", "2122829695083589819") },
      { handle: "mrkhalidmaan", badge: "2nd", title: "The complete guide", why: "Every tool, all four safety check results, exact-amount approvals and how Stoa is secured.", url: post("mrkhalidmaan", "2122906413437534446") },
      { handle: "EdrinValecrest", badge: "3rd", title: "The step-by-step written guide", why: "Every venue, setting and safeguard, in one post you can save for your first swap.", url: post("EdrinValecrest", "2123027108469281010") },
      { handle: "okezienedum", title: "Stoa on mobile", why: "Two phone recordings, including the wallet screen that shows the Stoa router address before you confirm.", url: post("okezienedum", "2123007629362360708") },
    ],
  },
  {
    id: "swap", h: "Your first swap", intro: "What to look at on the quote, and how to check the swap after it lands.",
    guides: [
      { handle: "Zevanbt", title: "Compare before, verify after", why: "Reads the wallet warning before signing, then follows the swap on the explorer.", url: post("Zevanbt", "2122947839718273155") },
      { handle: "Mcbondx", title: "Reading the venue table", why: "How the every-venue comparison and the 2 bps fee show up on a real quote.", url: post("Mcbondx", "2122896582454489245") },
      { handle: "shesdhee", title: "What a small swap really costs", why: "The fee and the gas on a few dollars, plus how to spot landing on the wrong network.", url: post("shesdhee", "2123026147537510628") },
    ],
  },
  {
    id: "check", h: "Check a token before you buy", intro: "The free safety check: what it tests, how to read it, and what a pass does not mean.",
    guides: [
      { handle: "krisxyzzz", title: "Two checks, start to finish", why: "Runs the safety check on two tokens and reads every line of the result.", url: post("krisxyzzz", "2122747299076129002") },
      { handle: "Riel_0x", title: "A pass is not the whole story", why: "A token that passes the check but would move 15% on the buy: why price impact still matters.", url: post("Riel_0x", "2123004235713229167") },
      { handle: "madjamra0", title: "Anyone can launch a token", why: "Copied names, the unverified label, and why passed does not mean a good investment.", url: post("madjamra0", "2122930031412326498") },
      { handle: "VictorBen001", title: "What gets checked", why: "The tests behind the check and the four possible results, in a short video.", url: post("VictorBen001", "2122973155287355892") },
    ],
  },
  {
    id: "stocks", h: "Stock tokens", intro: "Robinhood Stock Tokens on-chain and why they can show two prices.",
    guides: [
      { handle: "JoeOnMotion", title: "Two prices, one stock", why: "Robinhood's reference price next to the on-chain price, and what to prepare before a swap.", url: post("JoeOnMotion", "2122979266325344491") },
    ],
  },
];
