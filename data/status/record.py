#!/usr/bin/env python3
"""Adds one uptime check run to the rolling status file shown on stoadex.com/status.

Input: results.txt with one line per check, "ok|fail<TAB>name". State: status.json (kept between runs with actions/cache
and published to the status-data branch). Keeps 30 days of daily counts per check and the incidents (a check failing,
from the first failed run to the first run where everything passes again).
"""
import json, sys, time, datetime as dt

res_path, state_path = sys.argv[1], sys.argv[2]
now = int(time.time())
UTC = dt.timezone.utc
day = dt.datetime.fromtimestamp(now, UTC).strftime("%Y-%m-%d")
rows = [l.rstrip("\n").split("\t", 1) for l in open(res_path) if "\t" in l]
try:
    s = json.load(open(state_path))
except Exception:
    s = {"days": {}, "incidents": []}

d = s["days"].setdefault(day, {"runs": 0, "okRuns": 0, "checks": {}})
d["runs"] += 1
allok = all(r == "ok" for r, _ in rows)
d["okRuns"] += 1 if allok else 0
for r, name in rows:
    c = d["checks"].setdefault(name, [0, 0])  # [ok, total]
    c[1] += 1
    c[0] += 1 if r == "ok" else 0

failing = sorted(name for r, name in rows if r != "ok")
open_inc = next((i for i in s["incidents"] if not i.get("end")), None)
was_open = open_inc is not None
if failing:
    if open_inc:
        open_inc["checks"] = sorted(set(open_inc["checks"]) | set(failing))
        open_inc["last"] = now
    else:
        s["incidents"].append({"start": now, "last": now, "checks": failing})
elif open_inc:
    open_inc["end"] = now

cut = (dt.datetime.fromtimestamp(now, UTC) - dt.timedelta(days=30)).strftime("%Y-%m-%d")
s["days"] = {k: v for k, v in sorted(s["days"].items()) if k >= cut}
s["incidents"] = [i for i in s["incidents"] if (i.get("end") or now) >= now - 30 * 86400][-50:]
s["updated"] = now
s["current"] = {"ok": allok, "failing": failing, "checks": [name for _, name in rows]}
json.dump(s, open(state_path, "w"), separators=(",", ":"))
is_open = any(not i.get("end") for i in s["incidents"])
if len(sys.argv) > 3:  # GITHUB_OUTPUT: publish now when an incident starts or ends
    open(sys.argv[3], "a").write(f"changed={'1' if was_open != is_open else '0'}\n")
print(("all ok" if allok else "failing: " + ", ".join(failing)) + f" · {d['okRuns']}/{d['runs']} runs ok today")
