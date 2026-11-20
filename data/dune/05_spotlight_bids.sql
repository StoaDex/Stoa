-- Stoa Spotlight: every bid, by week (epoch) and token
SELECT
  varbinary_to_uint256(topic1) AS week,
  bytearray_substring(topic2, 13, 20) AS token,
  bytearray_substring(topic3, 13, 20) AS bidder,
  CAST(varbinary_to_uint256(bytearray_substring(data, 1, 32)) AS DOUBLE) / 1e18 AS bid_eth,
  CAST(varbinary_to_uint256(bytearray_substring(data, 33, 32)) AS DOUBLE) / 1e18 AS entry_fee_eth,
  block_time,
  tx_hash
FROM robinhood.logs
WHERE contract_address = 0xf3A995D4240c0F36da697E5292B294052a1706B5
  AND topic0 = 0xb250059d7fe2fecf786e63757950d6c8821ffef13a84f4116f06fb048716f461
ORDER BY block_time DESC
