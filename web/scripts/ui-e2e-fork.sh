#!/usr/bin/env bash
# UI end-to-end on a local fork of Elysium mainnet: deploys the real Stoa stack (Deploy.s.sol, all venues),
# builds the app against it, then buys a launchpad token whose only pool is on Uniswap V4 (adding the pool
# from the app first) and checks swap history and stats.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
A="$(cd "$(dirname "$0")/.." && pwd)"; C="$A/../contracts"
DK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
FORK=${ELYSIUM_RPC_URL:-https://rpc.elysium.kinetiq.xyz}; RPC=http://127.0.0.1:8545
anvil --fork-url $FORK --silent & ANVIL=$!
trap 'kill $ANVIL $NEXT 2>/dev/null || true; cp /tmp/stoa-deployments.bak "$A/lib/deployments.json" 2>/dev/null || true' EXIT
sleep 4
cd "$A"; cp lib/deployments.json /tmp/stoa-deployments.bak; cd $C
# Elysium is Arbitrum Orbit: give the fork an ArbSys precompile (Aero's swap hook reads it)
cast rpc anvil_setCode 0x0000000000000000000000000000000000000064 "$(forge inspect ArbSysMock deployedBytecode)" --rpc-url $RPC >/dev/null
# owner = the test wallet, so the app can accept ownership and pause from /admin
OWNER=0x90F79bf6EB2c4f870365E785982E1f101E93b906 TREASURY=$ME forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --private-key $DK --slow >/dev/null
J=$C/deployments/99901.json; cp $J /tmp/stoa-fork.json; rm -f $J
cd $A
cp /tmp/stoa-fork.json lib/deployments.json  # same file the deploy workflow commits
export NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_CHAIN_ID=99901 NEXT_PUBLIC_RPC_URL=$RPC NEXT_PUBLIC_LOGS_RPC_URL=$RPC NEXT_PUBLIC_EXPLORER_URL= \
  NEXT_PUBLIC_ROUTER=$(jq -r .router /tmp/stoa-fork.json) \
  NEXT_PUBLIC_POOL_WHYPE_USDC=$(jq -r .poolWhypeUsdc /tmp/stoa-fork.json) NEXT_PUBLIC_FEE_DISTRIBUTOR=$(jq -r .feeDistributor /tmp/stoa-fork.json) \
  NEXT_PUBLIC_UNIV4_ADAPTER=$(jq -r .uniswapV4Adapter /tmp/stoa-fork.json)
npx next build --no-lint >/dev/null 2>&1 || { echo "build failed"; exit 1; }
npx next start -p 3100 >/tmp/next.log 2>&1 & NEXT=$!
sleep 4
python3 scripts/ui-e2e-fork.py
