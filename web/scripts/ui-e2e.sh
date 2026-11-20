#!/usr/bin/env bash
# Deploys a local Stoa stack on anvil, builds the app against it, and runs the UI swap test.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
A="$(cd "$(dirname "$0")/.." && pwd)"; C="$A/../contracts"
DK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
anvil --block-time 1 --silent & ANVIL=$!
trap 'kill $ANVIL $NEXT 2>/dev/null || true' EXIT
sleep 2
cd $C && DEPLOYER_KEY=$DK TRADER=0x90F79bf6EB2c4f870365E785982E1f101E93b906 forge script script/LocalApp.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow >/dev/null
J=$C/localapp.json
cd $A
export NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 \
  NEXT_PUBLIC_ROUTER=$(jq -r .router $J) NEXT_PUBLIC_POOL_WHYPE_USDC=$(jq -r .pool $J) NEXT_PUBLIC_FEE_DISTRIBUTOR=$(jq -r .fees $J) \
  NEXT_PUBLIC_WHYPE=$(jq -r .whype $J) NEXT_PUBLIC_USDC=$(jq -r .usdc $J)
npx next build --no-lint >/dev/null 2>&1 || { echo "build failed"; exit 1; }
npx next start -p 3100 >/tmp/next.log 2>&1 & NEXT=$!
sleep 4
python3 scripts/ui-e2e.py
