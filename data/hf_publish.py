"""Publish Stoa's open data and releases to Hugging Face (.github/workflows/open-data.yml, every 6 hours).

Targets (all under the StoaDex account; HF_OWNER changes it):
  onchain    datasets/StoaDex/stoa-onchain                every swap through Stoa's routers, daily summary, Points
                                                          board, Spotlight week; tagged per ISO week (w2026-48)
  stocks     datasets/StoaDex/robinhood-stock-tokens      every Robinhood Stock Token: Robinhood's bid/ask next to the
                                                          deepest on-chain pool, one snapshot per run, a file per day
  venues     datasets/StoaDex/robinhood-chain-venue-quotes a fixed basket of swaps quoted on every venue Stoa's router
                                                          uses, in one block, one snapshot per run, a file per day
  contracts  datasets/StoaDex/stoa-contracts              release archive: contract source, ABIs, deployments and
                                                          security documents as a reproducible tarball with SHA-256s;
                                                          a new release only when any of it changed
  space      spaces/StoaDex/stoa-dashboard                a static dashboard reading the live export API

Data comes from stoadex.com/api/v1/export (public on-chain data only).

  python3 -I hf_publish.py --out ./out                    build every target's files, upload nothing (no token)
  HF_TOKEN=... python3 -I hf_publish.py --push            build and upload (the token comes from GitHub Secrets)
  ... --only stocks,venues                                some targets only
"""
import argparse
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import urllib.request

SITE = os.environ.get("STOA_SITE", "https://stoadex.com")
OWNER = os.environ.get("HF_OWNER", "StoaDex")
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
NOW = dt.datetime.now(dt.timezone.utc)
STAMP = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
DAY = NOW.strftime("%Y-%m-%d")
BADGES = ("[![Website](https://img.shields.io/badge/stoadex.com-live-2f6fd6)](https://stoadex.com) "
          "[![HEY Research Lab](https://heyresearch.xyz/api/badge/stoa?style=pill)](https://heyresearch.xyz/project/stoa?utm_source=badge&utm_medium=hf) "
          "[![Source](https://img.shields.io/badge/GitHub-StoaDex%2FStoa-1e2633?logo=github)](https://github.com/StoaDex/Stoa) "
          "[![X](https://img.shields.io/badge/X-@StoaDEX-1e2633?logo=x)](https://x.com/StoaDEX)")
LINKS = "[stoadex.com](https://stoadex.com) · [source](https://github.com/StoaDex/Stoa) · [docs](https://stoadex.com/docs/open-data) · [X @StoaDEX](https://x.com/StoaDEX)"


def get(set_name):
    req = urllib.request.Request(f"{SITE}/api/v1/export?set={set_name}", headers={"user-agent": "stoa-open-data/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def iso(t):
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_csv(rows, cols, header=True):
    b = io.StringIO()
    w = csv.DictWriter(b, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
    if header:
        w.writeheader()
    for r in rows:
        w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in cols})
    return b.getvalue()


def sha(b):
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()


def write(out, files):
    for p, b in files.items():
        f = os.path.join(out, p)
        os.makedirs(os.path.dirname(f), exist_ok=True)
        with open(f, "wb") as h:
            h.write(b if isinstance(b, bytes) else b.encode())


def existing(repo, path, kind="dataset"):
    """a file already in the repo (to append a day's snapshots), or None"""
    if not os.environ.get("HF_TOKEN"):
        return None
    try:
        from huggingface_hub import hf_hub_download
        return open(hf_hub_download(repo, path, repo_type=kind, token=os.environ["HF_TOKEN"], force_download=True)).read()
    except Exception:
        return None


# ---------- onchain ----------
ONCHAIN_CARD = """---
license: cc-by-4.0
pretty_name: Stoa on-chain data
tags: [defi, dex, onchain, robinhood-chain, elysium, uniswap, swaps]
configs:
- config_name: swaps
  data_files: data/swaps.csv
- config_name: daily
  data_files: data/daily.csv
- config_name: points_s1
  data_files: data/points_s1.csv
---

# Stoa on-chain data

{badges}

Open data from [Stoa](https://stoadex.com), the swap router on Robinhood Chain and Elysium: every swap routed through
Stoa, a daily summary, the Points season 1 board and the Spotlight week. Refreshed every 6 hours; each week is tagged
with its ISO week (for example `w2026-48`).

Everything here is already public on-chain. It is read from Stoa's router contracts (`Routed` events) and from
SpotlightMarket; nothing off-chain is added. Not financial advice; points have no promised value.

## Files

| File | What it holds |
| --- | --- |
| `data/swaps.csv` | One row per swap: chain, time (UTC), transaction, tokens in and out with symbols and amounts, USD value (as Stoa's Stats page values it, empty when unknown), trader (who received the output) and referrer |
| `data/daily.csv` | Swaps and USD volume per UTC day and chain |
| `data/points_s1.csv` | Points season 1 board: rank, wallet, points from swaps and from referrals, swaps counted. Empty before Mon 23 Nov 2026 00:00 UTC |
| `data/spotlight.json` | The Spotlight week at the time of the update: rules, candidates with bids and votes, last week's winners |
| `manifest.json` | Generated time, row counts and the SHA-256 of every file |

## Verify

```
sha256sum data/*.csv data/spotlight.json
```

The hashes must match `manifest.json`. The live source is `{site}/api/v1/export?set=swaps`.

## Related

- [StoaDex/robinhood-stock-tokens](https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens): Robinhood Stock Tokens, Robinhood's price next to the on-chain price
- [StoaDex/robinhood-chain-venue-quotes](https://huggingface.co/datasets/StoaDex/robinhood-chain-venue-quotes): the same swaps quoted on every venue
- [StoaDex/stoa-contracts](https://huggingface.co/datasets/StoaDex/stoa-contracts): contract release archive
- [Dashboard](https://huggingface.co/spaces/StoaDex/stoa-dashboard)

{links}

Generated {generated} UTC · {swaps} swaps · {wallets} wallets on the Points board
"""


def onchain():
    sw, pts, sp = get("swaps"), get("points"), get("spotlight")
    swaps = sw["rows"]
    for r in swaps:
        r["time_utc"] = iso(r["time"])
    files = {"data/swaps.csv": to_csv(swaps, ["chain", "time_utc", "time", "tx", "token_in", "symbol_in", "amount_in", "token_out", "symbol_out", "amount_out", "usd", "trader", "referrer"])}
    day = {}
    for r in swaps:
        d = day.setdefault((r["time_utc"][:10], r["chain"]), {"date": r["time_utc"][:10], "chain": r["chain"], "swaps": 0, "usd": 0.0})
        d["swaps"] += 1
        d["usd"] += r["usd"] or 0
    daily = sorted(day.values(), key=lambda d: (d["date"], d["chain"]))
    for d in daily:
        d["usd"] = round(d["usd"], 2)
    files["data/daily.csv"] = to_csv(daily, ["date", "chain", "swaps", "usd"])
    prow = [{**r, "swap_points": round(r["swapPoints"], 4), "ref_points": round(r["refPoints"], 4)} for r in pts["rows"]]
    files["data/points_s1.csv"] = to_csv(prow, ["rank", "address", "points", "swap_points", "ref_points", "swaps"])
    files["data/spotlight.json"] = json.dumps({k: v for k, v in sp.items() if k not in ("set", "generated")}, indent=1) + "\n"
    rows = {"data/swaps.csv": len(swaps), "data/daily.csv": len(daily), "data/points_s1.csv": len(prow)}
    man = {"generated": STAMP, "source": SITE + "/api/v1/export", "rows": rows, "sha256": {p: sha(b) for p, b in files.items()}}
    files["manifest.json"] = json.dumps(man, indent=1) + "\n"
    files["README.md"] = ONCHAIN_CARD.replace("{site}", SITE).replace("{badges}", BADGES).replace("{links}", LINKS).replace("{generated}", STAMP).replace("{swaps}", str(len(swaps))).replace("{wallets}", str(len(prow)))
    y, w, _ = NOW.isocalendar()
    return {"repo": f"{OWNER}/stoa-onchain", "kind": "dataset", "files": files, "tag": f"w{y}-{w:02d}", "msg": f"Update {STAMP}: {len(swaps)} swaps"}


# ---------- daily snapshot datasets ----------
def snapshot(repo, rows, cols, card):
    path = f"data/{DAY[:7]}/{DAY}.csv"
    old = existing(repo, path)
    body = (old if old and old.endswith("\n") else (old + "\n" if old else "")) + to_csv(rows, cols, header=not old)
    files = {path: body, "latest.csv": to_csv(rows, cols), "README.md": card}
    return {"repo": repo, "kind": "dataset", "files": files, "msg": f"Snapshot {STAMP}: {len(rows)} rows"}


STOCK_COLS = ["snapshot_utc", "symbol", "name", "address", "robinhood_bid", "robinhood_ask", "halted", "onchain_price", "gap_pct", "liquidity_usd", "volume24h_usd", "change24h_pct", "stoa_routes"]
STOCK_CARD = """---
license: cc-by-4.0
pretty_name: Robinhood Stock Tokens, Robinhood price vs on-chain price
tags: [robinhood-chain, tokenized-stocks, rwa, defi, onchain, prices]
configs:
- config_name: snapshots
  data_files: data/*/*.csv
- config_name: latest
  data_files: latest.csv
---

# Robinhood Stock Tokens: Robinhood price vs on-chain price

{badges}

Every Robinhood Stock Token on Robinhood Chain, four times a day: Robinhood's own bid and ask for one token (from the
underlying shares) next to the price of the deepest on-chain pool, the gap between them, on-chain liquidity and
volume, and whether [Stoa](https://stoadex.com) routes swaps for it. Collected by Stoa from public sources: Robinhood's
public market data and on-chain pools (via DexScreener). Not financial advice.

## Columns

| Column | Meaning |
| --- | --- |
| `snapshot_utc` | When the snapshot was taken |
| `symbol`, `name`, `address` | The stock token (address on Robinhood Chain, chain id 4663) |
| `robinhood_bid`, `robinhood_ask` | Robinhood's quote for one token, USD |
| `halted` | Trading halt on the underlying |
| `onchain_price` | Price of the deepest on-chain pool, USD |
| `gap_pct` | On-chain price against Robinhood's mid price, in percent (positive: on-chain is higher) |
| `liquidity_usd`, `volume24h_usd`, `change24h_pct` | That pool's liquidity, 24h volume and 24h change |
| `stoa_routes` | Stoa's router quoted a 100 USDG buy at that time |

Files: `data/YYYY-MM/YYYY-MM-DD.csv` (one per UTC day, a block of rows per snapshot) and `latest.csv`. Outside US
market hours Robinhood's quote follows the overnight session, so gaps are wider then.

{links}
"""

VENUE_COLS = ["snapshot_utc", "block", "pair", "sell", "buy", "amount_in", "venue", "venue_address", "amount_out", "vs_best_bps", "router_out"]
VENUE_CARD = """---
license: cc-by-4.0
pretty_name: Robinhood Chain venue quotes
tags: [robinhood-chain, defi, dex, liquidity, uniswap, routing, onchain]
configs:
- config_name: snapshots
  data_files: data/*/*.csv
- config_name: latest
  data_files: latest.csv
---

# Robinhood Chain venue quotes

{badges}

Four times a day, a fixed basket of swaps on Robinhood Chain (ETH↔USDG, ETH→STOA and USDG→ stock tokens such as
TSLA, NVDA and SPCX, at a few sizes) quoted on every venue [Stoa](https://stoadex.com)'s router uses (Uniswap V2, V3,
V4, Aero, Ramses, Pons curves, Metric), all in the same block. It shows how deep each venue is for the same trade and
how far apart their prices are. Read-only `eth_call`s of each venue adapter's `quote`; nothing was traded.

## Columns

| Column | Meaning |
| --- | --- |
| `snapshot_utc`, `block` | When, and the Robinhood Chain block every quote in the snapshot was read at |
| `pair`, `sell`, `buy`, `amount_in` | The swap, in whole tokens |
| `venue`, `venue_address` | The venue and Stoa's adapter for it |
| `amount_out` | What this venue alone returns, one hop, before any fee; empty when it has no pool for the pair |
| `vs_best_bps` | How much less than the venue that returns the most, in basis points (0 = that venue) |
| `router_out` | What Stoa's router returns for the same swap (its best route, after Stoa's 2 bps fee, possibly through WETH) |

A venue quote is a reading at one block, not a fill: prices move and a real swap also pays gas. Not financial advice.

{links}
"""


def stocks():
    d = get("stocks")
    rows = [{**r, "snapshot_utc": STAMP} for r in d["rows"]]
    return snapshot(f"{OWNER}/robinhood-stock-tokens", rows, STOCK_COLS, STOCK_CARD.replace("{badges}", BADGES).replace("{links}", LINKS))


def venues():
    d = get("venues")
    rows = [{**r, "snapshot_utc": iso(r["time"])} for r in d["rows"]]
    return snapshot(f"{OWNER}/robinhood-chain-venue-quotes", rows, VENUE_COLS, VENUE_CARD.replace("{badges}", BADGES).replace("{links}", LINKS))


# ---------- contracts release archive ----------
REL_CARD = """---
license: mit
pretty_name: Stoa contracts release archive
tags: [solidity, smart-contracts, defi, robinhood-chain, elysium, security]
---

# Stoa contracts: release archive

{badges}

Every release of [Stoa](https://stoadex.com)'s smart contracts as one reproducible archive: the Solidity source, the
compiled ABIs, the deployed addresses on Robinhood Chain (4663) and Elysium (99901), and the security documents
(audit guide, known issues, the internal security review and the list of outside reviews, including the
independent security review by HEY Research Lab). A new release is published only when any of these change.

## Releases

{releases}

## Verify a release

1. Download `releases/<tag>/stoa-contracts.tar.gz` and `releases/<tag>/manifest.json`.
2. `sha256sum stoa-contracts.tar.gz` must equal `archive_sha256` in the manifest.
3. Unpack it: `sha256sum` of every file must match `files` in the manifest.
4. The source is the GitHub repository at the manifest's `commit`: `git checkout <commit>` and compare `contracts/src`.
5. Deployed addresses are in `deployments/`; check them on the explorers (Robinhood Chain: explorer.chain.robinhood.com).

The archive is built deterministically (sorted paths, fixed timestamps, no owner names), so the same commit always
gives the same `archive_sha256`.

{links}
"""


def rel_card(rel):
    lines = "\n".join(f"- `{r['tag']}` · {r['released']} · commit [`{r['commit'][:7]}`](https://github.com/StoaDex/Stoa/commit/{r['commit']}) · archive SHA-256 `{r['archive_sha256'][:16]}…`" for r in rel)
    return REL_CARD.replace("{releases}", lines or "None yet.").replace("{badges}", BADGES).replace("{links}", LINKS)


def _git(*a):
    return subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True, check=True).stdout.strip()


def contracts():
    pick = []
    for base, sub in (("contracts/src", None), ("contracts/deployments", None)):
        for dp, _, fs in os.walk(os.path.join(ROOT, base)):
            for f in fs:
                if f.endswith((".sol", ".json")):
                    pick.append(os.path.relpath(os.path.join(dp, f), ROOT))
    for f in ("contracts/foundry.toml", "contracts/AUDIT.md", "contracts/KNOWN_ISSUES.md", "contracts/SECURITY.md", "contracts/LICENSE",
              "web/content/docs/security-review.md", "web/content/docs/audits.md", "web/lib/deployments.json", "web/lib/deployments-4663.json"):
        if os.path.exists(os.path.join(ROOT, f)):
            pick.append(f)
    out_dir = os.path.join(ROOT, "contracts/out")
    abis = {}
    if os.path.isdir(out_dir):  # forge build ran (the workflow does it): one ABI per contract in contracts/src
        names = {os.path.splitext(os.path.basename(p))[0] for p in pick if p.startswith("contracts/src/") and p.endswith(".sol") and "/interfaces/" not in p}
        for n in sorted(names):
            j = os.path.join(out_dir, f"{n}.sol", f"{n}.json")
            if os.path.exists(j):
                abis[f"abi/{n}.json"] = json.dumps(json.load(open(j))["abi"], indent=1) + "\n"
    contents = {}
    for p in sorted(set(pick)):
        arc = p.replace("contracts/src/", "src/").replace("contracts/deployments/", "deployments/").replace("web/lib/", "deployments/web-").replace("web/content/docs/", "security/").replace("contracts/", "")
        contents[arc] = open(os.path.join(ROOT, p), "rb").read()
    for p, b in abis.items():
        contents[p] = b.encode()
    content_sha = sha("".join(f"{p}\0{sha(b)}\n" for p, b in sorted(contents.items())))
    repo = f"{OWNER}/stoa-contracts"
    prev = existing(repo, "latest.json")
    if prev:
        try:
            if json.loads(prev).get("content_sha256") == content_sha:
                # nothing changed since the last release: only keep the card current
                try:
                    rel = json.loads(existing(repo, "releases.json") or "[]")
                except ValueError:
                    rel = []
                return {"repo": repo, "kind": "dataset", "files": {"README.md": rel_card(rel)}, "msg": "Card update"}
        except ValueError:
            pass
    commit = _git("rev-parse", "HEAD")
    tag = f"r{NOW.strftime('%Y%m%d')}-{commit[:7]}"
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode="w", format=tarfile.PAX_FORMAT) as t:
            for p, b in sorted(contents.items()):
                ti = tarfile.TarInfo(f"stoa-contracts/{p}")
                ti.size, ti.mtime, ti.mode, ti.uid, ti.gid, ti.uname, ti.gname = len(b), 0, 0o644, 0, 0, "", ""
                t.addfile(ti, io.BytesIO(b))
    tar = buf.getvalue()
    man = {"tag": tag, "released": STAMP, "commit": commit, "repository": "https://github.com/StoaDex/Stoa",
           "archive": "stoa-contracts.tar.gz", "archive_sha256": sha(tar), "content_sha256": content_sha,
           "files": {p: sha(b) for p, b in sorted(contents.items())}}
    hist = existing(repo, "releases.json")
    try:
        rel = json.loads(hist) if hist else []
    except ValueError:
        rel = []
    rel = [{"tag": tag, "released": STAMP, "commit": commit, "archive_sha256": man["archive_sha256"]}] + rel
    files = {
        f"releases/{tag}/stoa-contracts.tar.gz": tar,
        f"releases/{tag}/manifest.json": json.dumps(man, indent=1) + "\n",
        "latest.json": json.dumps(man, indent=1) + "\n",
        "releases.json": json.dumps(rel, indent=1) + "\n",
        "README.md": rel_card(rel),
    }
    return {"repo": repo, "kind": "dataset", "files": files, "tag": tag, "msg": f"Release {tag}"}


# ---------- dashboard space ----------
def space():
    files = {}
    for f in sorted(os.listdir(os.path.join(HERE, "space"))):
        files[f] = open(os.path.join(HERE, "space", f), "rb").read()
    return {"repo": f"{OWNER}/stoa-dashboard", "kind": "space", "files": files, "msg": "Dashboard update"}


TARGETS = {"onchain": onchain, "stocks": stocks, "venues": venues, "contracts": contracts, "space": space}


def push(t):
    from huggingface_hub import CommitOperationAdd, HfApi
    api = HfApi(token=os.environ["HF_TOKEN"])
    if t["kind"] == "space":
        api.create_repo(t["repo"], repo_type="space", space_sdk="static", exist_ok=True)
    else:
        api.create_repo(t["repo"], repo_type="dataset", exist_ok=True)
    ops = [CommitOperationAdd(path_in_repo=p, path_or_fileobj=(b if isinstance(b, bytes) else b.encode())) for p, b in t["files"].items()]
    api.create_commit(repo_id=t["repo"], repo_type=t["kind"], operations=ops, commit_message=t["msg"])
    if t.get("tag"):
        try:
            api.create_tag(t["repo"], repo_type=t["kind"], tag=t["tag"], tag_message=t["msg"])
        except Exception as e:  # the week's tag already exists
            print("  tag:", str(e).splitlines()[0])
    print("published", t["kind"], t["repo"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="hf-out")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--only", default=",".join(TARGETS))
    a = ap.parse_args()
    if a.push and not os.environ.get("HF_TOKEN"):
        sys.exit("HF_TOKEN is not set")
    failed = []
    for name in [x for x in a.only.split(",") if x]:
        try:
            t = TARGETS[name]()
            if t is None:
                print(name, ": unchanged, nothing to publish")
                continue
            write(os.path.join(a.out, name), t["files"])
            print(name, ":", t["repo"], len(t["files"]), "files")
            if a.push:
                push(t)
        except Exception as e:  # one target failing does not stop the others
            print(name, ": FAILED", e)
            failed.append(name)
    if failed:
        sys.exit("failed: " + ",".join(failed))
