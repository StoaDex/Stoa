-- Stoa on Robinhood Chain: swaps, traders and USD volume per day (UTC)
-- One Routed event per settled swap on the Stoa router. USD value: the USDG side at $1, else the ETH/WETH side at
-- Ethereum's WETH price that minute. Swaps with neither side counted at $0 (rare: token-to-token without ETH or USDG).
WITH routed AS (
  SELECT
    block_time,
    tx_hash,
    bytearray_substring(topic1, 13, 20) AS trader,
    bytearray_substring(data, 13, 20) AS token_in,
    bytearray_substring(data, 45, 20) AS token_out,
    varbinary_to_uint256(bytearray_substring(data, 65, 32)) AS amount_in,
    varbinary_to_uint256(bytearray_substring(data, 97, 32)) AS amount_out
  FROM robinhood.logs
  WHERE contract_address = 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5
    AND topic0 = 0x2bbce25631e8fa58085b7ea5929726c3acdf2df8d6b1f099eb32fb7425a4f6da
    AND block_number >= 114244443
),
eth AS (
  SELECT minute, price FROM prices.usd
  WHERE blockchain = 'ethereum' AND contract_address = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
    AND minute >= TIMESTAMP '2026-11-01'
),
priced AS (
  SELECT r.*,
    CASE
      WHEN r.token_in  = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 THEN CAST(r.amount_in AS DOUBLE) / 1e6
      WHEN r.token_out = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 THEN CAST(r.amount_out AS DOUBLE) / 1e6
      WHEN r.token_in  IN (0x0000000000000000000000000000000000000000, 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73) THEN CAST(r.amount_in AS DOUBLE) / 1e18 * e.price
      WHEN r.token_out IN (0x0000000000000000000000000000000000000000, 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73) THEN CAST(r.amount_out AS DOUBLE) / 1e18 * e.price
      ELSE 0
    END AS usd
  FROM routed r
  LEFT JOIN eth e ON e.minute = date_trunc('minute', r.block_time)
)
SELECT
  date_trunc('day', block_time) AS day,
  count(*) AS swaps,
  count(DISTINCT trader) AS traders,
  sum(usd) AS volume_usd,
  sum(sum(usd)) OVER (ORDER BY date_trunc('day', block_time)) AS cumulative_volume_usd
FROM priced
GROUP BY 1
ORDER BY 1
