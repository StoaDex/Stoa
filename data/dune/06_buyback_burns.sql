-- $STOA weekly buyback: each buy-and-burn by the StoaBuyback contract
SELECT
  block_time,
  bytearray_substring(topic1, 13, 20) AS fee_token,
  CAST(varbinary_to_uint256(bytearray_substring(data, 1, 32)) AS DOUBLE) AS fee_amount_raw,
  CAST(varbinary_to_uint256(bytearray_substring(data, 33, 32)) AS DOUBLE) / 1e18 AS stoa_burned,
  sum(CAST(varbinary_to_uint256(bytearray_substring(data, 33, 32)) AS DOUBLE) / 1e18) OVER (ORDER BY block_time) AS total_stoa_burned,
  tx_hash
FROM robinhood.logs
WHERE contract_address = 0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244
  AND topic0 = 0xf887dacc92cb9c4a8ce46c0aaef10c7a85f7758495f717c5e568259998610ed3
ORDER BY block_time
