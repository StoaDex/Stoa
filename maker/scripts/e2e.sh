#!/usr/bin/env bash
# End-to-end test on a local anvil chain: deploy Stoa, run the bot with a fixed price, swap against it.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
M="$(cd "$(dirname "$0")/.." && pwd)"
C="$M/../contracts"
RPC=http://127.0.0.1:8545
DK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil #0 deployer
MK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil #1 maker
TK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a   # anvil #2 trader
TRADER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

anvil --block-time 1 --silent & ANVIL=$!
trap 'kill $ANVIL 2>/dev/null; kill $BOT 2>/dev/null || true' EXIT
sleep 2
cd $C && DEPLOYER_KEY=$DK MAKER_KEY=$MK TRADER=$TRADER forge script script/LocalE2E.s.sol --rpc-url $RPC --broadcast --slow >/dev/null
POOL=$(jq -r .pool $C/e2e.json); ROUTER=$(jq -r .router $C/e2e.json); USDC=$(jq -r .usdc $C/e2e.json); WHYPE=$(jq -r .whype $C/e2e.json); FEES=$(jq -r .fees $C/e2e.json)
echo "pool $POOL"

cd $M && rm -f KILL midfile && MID_FILE=$M/midfile RPC_URL=$RPC CHAIN_ID=31337 PRIVATE_KEY=$MK POOL=$POOL PRICE_SOURCE=static STATIC_MID=40 \
  POLL_MS=200 PRIORITY_FEE_GWEI=1 HEALTH_PORT=8799 node dist/src/index.js > e2e.log 2>&1 & BOT=$!
sleep 6

echo "--- quote on chain"
cast call $POOL "current()(uint128,uint128,uint96,uint96,uint64)" --rpc-url $RPC
echo "--- health"
curl -s 127.0.0.1:8799/health; echo

echo "--- trader sells 1 WHYPE through the router"
cast send $WHYPE "approve(address,uint256)" $ROUTER 1000000000000000000000 --private-key $TK --rpc-url $RPC >/dev/null
cast block-number --rpc-url $RPC; cast call $POOL "current()(uint128,uint128,uint96,uint96,uint64)" --rpc-url $RPC; cast call $POOL "quoteOut(address,uint256)(uint256)" $WHYPE 1000000000000000000 --rpc-url $RPC; curl -s 127.0.0.1:8799/health; echo
B0=$(cast call $USDC "balanceOf(address)(uint256)" $TRADER --rpc-url $RPC | awk '{print $1}')
DL=$(( $(date +%s) + 600 ))
Z=0x0000000000000000000000000000000000000000
# route from the router's own quote (eth_call), then swap along it
ROUTE=$(cast call $ROUTER "quote(address,address,uint256)((uint256,address,(address,bool),(address,bool)))" $WHYPE $USDC 1000000000000000000 --rpc-url $RPC)
echo "route: $ROUTE"
cast send $ROUTER "swap((address,address,address,(address,bool),(address,bool),uint256,uint256,address,uint256,address))" \
  "($WHYPE,$USDC,$Z,($POOL,true),($Z,false),1000000000000000000,39000000,$TRADER,$DL,$Z)" --private-key $TK --rpc-url $RPC >/dev/null
B1=$(cast call $USDC "balanceOf(address)(uint256)" $TRADER --rpc-url $RPC | awk '{print $1}')
echo "trader received $(( B1 - B0 )) USDC raw for 1 WHYPE"
echo "fees accrued $(cast call $FEES 'protocolAccrued(address)(uint256)' $USDC --rpc-url $RPC)"

echo "--- price jump to 43 -> cooldown, quote pulled"
echo 43 > $M/midfile
sleep 4
echo "--- kill switch"
touch $M/KILL
sleep 4
kill -0 $BOT 2>/dev/null && echo "bot still running (unexpected)" || echo "bot exited"
cast call $POOL "current()(uint128,uint128,uint96,uint96,uint64)" --rpc-url $RPC
echo "--- bot log"
tail -n 12 $M/e2e.log
