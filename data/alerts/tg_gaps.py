#!/usr/bin/env python3
"""Posts Robinhood Stock Token price gaps to a Telegram channel.

Reads the same filtered gaps as stoadex.com/stocks (the public stock_gaps tool at stoadex.com/mcp: real liquidity, pools
that trade, not halted, |gap| <= 25%) and posts a stock when its gap reaches THRESHOLD %. The same stock is posted again
only after COOLDOWN_H hours, when its gap has widened by WIDEN points, or when it flips side. State is a small JSON file
kept between runs (actions/cache). Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT (e.g. @StoaGaps); the token is never printed.
"""
import json, os, sys, time, urllib.request, urllib.parse

THRESHOLD = float(os.environ.get("GAP_THRESHOLD", "1.5"))
WIDEN = float(os.environ.get("GAP_WIDEN", "1.0"))
COOLDOWN_H = float(os.environ.get("GAP_COOLDOWN_H", "6"))
MIN_LIQ = float(os.environ.get("GAP_MIN_LIQ", "50000"))
STATE = next((a for a in sys.argv[1:] if not a.startswith("--")), "tg_state.json")
DRY = os.environ.get("DRY_RUN") == "1"


def gaps():
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "stock_gaps", "arguments": {"limit": 20, "minLiquidityUsd": MIN_LIQ}}}).encode()
    req = urllib.request.Request("https://stoadex.com/mcp", data=body, headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": "stoa-gap-alerts"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    return json.loads(d["result"]["content"][0]["text"])["stocks"]


def usd(v):
    return f"${v:,.2f}" if v < 1000 else f"${v:,.0f}"


def big(v):
    return f"${v/1e6:.1f}M" if v >= 1e6 else f"${v/1e3:.0f}K"


def message(s):
    g = s["gapPct"]
    side = "cheaper" if g < 0 else "dearer"
    sym = s["symbol"]
    return (
        f"<b>{sym}</b> is {abs(g):.2f}% {side} on-chain than on Robinhood\n\n"
        f"Robinhood: {usd(s['robinhoodPriceUsd'])}\n"
        f"On-chain: {usd(s['onChainPriceUsd'])}\n"
        f"Liquidity {big(s['liquidityUsd'])} · 24h volume {big(s['volume24h'])}\n\n"
        f"<a href=\"https://stoadex.com/stocks/{sym}\">Compare every route on Stoa</a>\n"
        f"<i>Information, not trading advice. Outside US market hours Robinhood's price follows the overnight session.</i>"
    )


def send(text):
    token, chat = os.environ["TELEGRAM_BOT_TOKEN"], os.environ["TELEGRAM_CHAT"]
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"}).encode()
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=30) as r:
            return json.load(r).get("ok", False)
    except urllib.error.HTTPError as e:  # report Telegram's reason, never the URL (it holds the token)
        print("telegram error", e.code, e.read().decode()[:200])
        return False


TEST_TEXT = (
    "<b>Stoa Gap Alerts is live</b>\n\n"
    "You get a message here when a Robinhood Stock Token trades 1.5% or more away from Robinhood's own price on-chain, "
    "among pools with real liquidity that actually trade.\n\n"
    "<a href=\"https://stoadex.com/stocks\">See every stock token on Stoa</a>\n"
    "<i>Information, not trading advice.</i>"
)


def main():
    if "--test" in sys.argv:
        print("sent" if send(TEST_TEXT) else "failed")
        return
    try:
        state = json.load(open(STATE))
    except Exception:
        state = {}
    now = time.time()
    posted = 0
    for s in gaps():
        g = s["gapPct"]
        if abs(g) < THRESHOLD:
            continue
        last = state.get(s["symbol"])
        if last:
            fresh = now - last["t"] < COOLDOWN_H * 3600
            same_side = (last["gap"] < 0) == (g < 0)
            if fresh and same_side and abs(g) < abs(last["gap"]) + WIDEN:
                continue
        text = message(s)
        print(("[dry] " if DRY else "") + text.splitlines()[0].replace("<b>", "").replace("</b>", ""))
        if DRY or send(text):
            state[s["symbol"]] = {"t": now, "gap": g}
            posted += 1
        if posted >= 5:
            break
    # forget stocks not posted for a week
    state = {k: v for k, v in state.items() if now - v["t"] < 7 * 86400}
    json.dump(state, open(STATE, "w"))
    print(f"posted {posted}")


if __name__ == "__main__":
    main()
