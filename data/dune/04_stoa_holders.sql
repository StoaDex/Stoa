-- $STOA: addresses holding any right now (the burn address and the launch curve excluded)
WITH moves AS (
  SELECT "to" AS holder, CAST(value AS DOUBLE) AS amt FROM erc20_robinhood.evt_Transfer
  WHERE contract_address = 0x13E6993417616De724F2b337D65063f229e96718
  UNION ALL
  SELECT "from" AS holder, -CAST(value AS DOUBLE) AS amt FROM erc20_robinhood.evt_Transfer
  WHERE contract_address = 0x13E6993417616De724F2b337D65063f229e96718
)
SELECT count(*) AS holders
FROM (SELECT holder, sum(amt) AS bal FROM moves GROUP BY 1) b
WHERE bal > 0
  AND holder NOT IN (0x000000000000000000000000000000000000dEaD, 0x0000000000000000000000000000000000000000, 0xd0b519310688e830c9aee29ae117edc3fbb1c13f)
