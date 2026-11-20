-- Stoa on Robinhood Chain: most swapped pairs over the last 7 days (by number of swaps)
WITH routed AS (
  SELECT
    bytearray_substring(data, 13, 20) AS token_in,
    bytearray_substring(data, 45, 20) AS token_out,
    bytearray_substring(topic1, 13, 20) AS trader
  FROM robinhood.logs
  WHERE contract_address = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5
    AND topic0 = 0x2bbce25631e8fa58085b7ea5929726c3acdf2df8d6b1f099eb32fb7425a4f6da
    AND block_time > now() - INTERVAL '7' DAY
),
sym AS (
  SELECT contract_address, symbol FROM tokens.erc20 WHERE blockchain = 'robinhood'
)
SELECT
  COALESCE(CASE WHEN r.token_in = 0x0000000000000000000000000000000000000000 THEN 'ETH' END, si.symbol, CAST(r.token_in AS VARCHAR)) AS sell,
  COALESCE(CASE WHEN r.token_out = 0x0000000000000000000000000000000000000000 THEN 'ETH' END, so.symbol, CAST(r.token_out AS VARCHAR)) AS buy,
  count(*) AS swaps,
  count(DISTINCT trader) AS traders
FROM routed r
LEFT JOIN sym si ON si.contract_address = r.token_in
LEFT JOIN sym so ON so.contract_address = r.token_out
GROUP BY 1, 2
ORDER BY swaps DESC
LIMIT 15
