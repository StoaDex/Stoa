# Quote freshness

A quote is only good for a short window, so swaps never fill at an old price.

Every quote carries an expiry. Today a quote is valid for **2 blocks**, roughly 200–400 ms on Elysium. A pool rejects any swap against an expired quote; the router then uses the next best source.

The swap screen refreshes the quote every few seconds and fetches a fresh one right before you sign.
