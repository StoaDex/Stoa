-- $STOA per day: burned (held by 0x…dEaD) and locked in Stoa's Spotlight market, from every $STOA Transfer
WITH t AS (
  SELECT evt_block_time AS ts, "from" AS f, "to" AS r, CAST(value AS DOUBLE) / 1e18 AS amt
  FROM erc20_robinhood.evt_Transfer
  WHERE contract_address = 0x13E6993417616De724F2b337D65063f229e96718
),
daily AS (
  SELECT
    date_trunc('day', ts) AS day,
    sum(CASE WHEN r = 0x000000000000000000000000000000000000dEaD THEN amt ELSE 0 END)
      - sum(CASE WHEN f = 0x000000000000000000000000000000000000dEaD THEN amt ELSE 0 END) AS burned,
    sum(CASE WHEN r = 0xf3A995D4240c0F36da697E5292B294052a1706B5 THEN amt ELSE 0 END)
      - sum(CASE WHEN f = 0xf3A995D4240c0F36da697E5292B294052a1706B5 THEN amt ELSE 0 END) AS locked
  FROM t
  GROUP BY 1
)
SELECT
  day,
  sum(burned) OVER (ORDER BY day) AS total_burned,
  sum(locked) OVER (ORDER BY day) AS total_locked_spotlight
FROM daily
ORDER BY day
