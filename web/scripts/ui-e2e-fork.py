"""UI end-to-end on a local Elysium fork: add a Uniswap V4 pool from the app, buy a launchpad token, check history and stats."""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ADDR = json.load(open('/tmp/stoa-fork.json'))
TRADER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
LAUNCH = '0x7e7384E8c7E622e0BBF5813c399fFA4AdB22DC44'  # KORILA, a Montra launch on Uniswap V4
REF = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
RPC = 'http://127.0.0.1:8545'
APP = 'http://127.0.0.1:3100'
SHIM = """
(() => {
const RPC='%s', ACC='%s';
const ev={}; let authed=false;
const provider={ isTestWallet:true,
  on(e,f){(ev[e]=ev[e]||[]).push(f)}, removeListener(){},
  async request({method,params}){
    if(method==='eth_requestAccounts'){authed=true; return [ACC];}
    if(method==='eth_accounts') return authed?[ACC]:[];
    if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain') return null;
    if(method==='wallet_requestPermissions'||method==='wallet_getPermissions') return [{parentCapability:'eth_accounts'}];
    const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});
    const j=await r.json(); if(j.error) throw Object.assign(new Error(j.error.message),{code:j.error.code}); return j.result; } };
window.ethereum=provider;
const info={uuid:'7a0f2c1e-0000-4000-8000-000000000001',name:'Test Wallet',icon:'data:image/svg+xml,%%3Csvg xmlns=%%22http://www.w3.org/2000/svg%%22/%%3E',rdns:'xyz.stoa.test'};
const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:Object.freeze({info,provider})}));
window.addEventListener('eip6963:requestProvider',announce); announce();
})();
""" % (RPC, TRADER)

async def wait(pg, sel, t=120000):
    try:
        await pg.wait_for_selector(sel, timeout=t)
    except Exception:
        btn = await pg.query_selector('button.big')
        print('WAIT FAILED for', sel, '| button:', btn and await btn.inner_text(), '| body:', (await pg.inner_text('main'))[:600].replace('\n', ' | '))
        await pg.screenshot(path=os.path.join(HERE, 'err.png')); raise

def cast(*a):
    return subprocess.check_output(['cast', *a, '--rpc-url', RPC], text=True).split()[0]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None)
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(SHIM)
        await pg.route('https://fonts.**', lambda r: r.abort())
        await pg.goto(f'{APP}/trade')
        await pg.wait_for_timeout(2500)
        await pg.click('header .cta')
        await pg.click('.wl button:has-text("Test Wallet")')
        await pg.wait_for_selector('text=Your wallet')
        await pg.click('button[aria-label="Close"]')

        # 1) HYPE -> USDC on the best real venue
        await pg.click('.box >> nth=0 >> button.tok'); await pg.click('.tokm button:has-text("HYPE") >> nth=0')
        await pg.click('.box >> nth=1 >> button.tok'); await pg.click('.tokm button:has-text("USDC")')
        await pg.fill('#sellv', '2')
        await wait(pg, 'button.big:has-text("Swap")')
        print('HYPE->USDC quote:', (await pg.inner_text('.det')).replace('\n', ' | '))
        await pg.click('button.big:has-text("Swap")')
        await pg.wait_for_selector('.ok:has-text("Swap confirmed"), .err', timeout=30000)
        if await pg.query_selector('.err'): print('ERROR:', await pg.inner_text('.err')); raise SystemExit(1)

        # 2) HYPE -> LAUNCH: the only pool is on Uniswap V4; add it from the app, then swap
        await pg.click('#sellv'); await pg.fill('#sellv', '')
        await pg.click('.box >> nth=1 >> button.tok')
        await pg.fill('.tokm input', LAUNCH)
        await pg.click('.tokm button:has-text("Import")')
        await pg.fill('#sellv', '0.05')
        await wait(pg, 'button:has-text("Add Uniswap V4 pool")')
        print('V4 notice shown')
        await pg.click('button:has-text("Add Uniswap V4 pool")')
        await pg.wait_for_selector('.ok:has-text("Add pool confirmed"), .err', timeout=30000)
        if await pg.query_selector('.err'): print('ERROR:', await pg.inner_text('.err')); raise SystemExit(1)
        await pg.click('label.chk:has-text("I checked the token address") input')
        await wait(pg, 'button.big:has-text("Swap")')
        print('HYPE->LAUNCH quote:', (await pg.inner_text('.det')).replace('\n', ' | '))
        await pg.click('button.big:has-text("Swap")')
        await pg.wait_for_selector('.ok:has-text("Swap confirmed"), .err', timeout=30000)
        if await pg.query_selector('.err'): print('ERROR:', await pg.inner_text('.err')); raise SystemExit(1)
        bal = cast('call', LAUNCH, 'balanceOf(address)(uint256)', TRADER)
        print('trader LAUNCH balance (wei):', bal)
        assert int(bal) > 0
        await pg.screenshot(path=os.path.join(HERE, 'ui-fork-swap.png'))

        # 3) history and stats from on-chain events
        await pg.click('footer a[href="/portfolio"]'); await pg.wait_for_timeout(1500)  # client-side: keep the wallet connected
        await wait(pg, 'table.tbl >> text=KORILA')
        print('portfolio history:', (await pg.inner_text('.panel:has-text("YOUR SWAPS")')).replace('\n', ' | ')[:300])
        await pg.click('footer a[href="/pools"]')
        await pg.wait_for_function("() => /SWAPS · ALL TIME\\s*\\d/.test(document.body.innerText)", timeout=30000)
        print('pools stats:', (await pg.inner_text('.grid3')).replace('\n', ' | '))
        await pg.screenshot(path=os.path.join(HERE, 'ui-fork-pools.png'))
        # 4) admin: accept ownership of the router, pause and unpause it
        await pg.goto(f'{APP}/admin'); await pg.wait_for_timeout(1500)
        await pg.click('header .cta'); await pg.click('.wl button:has-text("Test Wallet")')
        await pg.wait_for_selector('text=Your wallet'); await pg.click('button[aria-label="Close"]')
        await wait(pg, 'button:has-text("Accept StoaRouter")')
        await pg.click('button:has-text("Accept StoaRouter")')
        await wait(pg, '.ok:has-text("Accept StoaRouter: confirmed")')
        assert cast('call', ADDR['router'], 'owner()(address)').lower() == TRADER.lower()
        await pg.click('button:has-text("Pause router")'); await wait(pg, '.ok:has-text("Pause router: confirmed")')
        assert cast('call', ADDR['router'], 'paused()(bool)') == 'true'
        await pg.click('button:has-text("Unpause router")'); await wait(pg, '.ok:has-text("Unpause router: confirmed")')
        assert cast('call', ADDR['router'], 'paused()(bool)') == 'false'
        print('admin: ownership accepted, pause/unpause ok')
        await pg.screenshot(path=os.path.join(HERE, 'ui-fork-admin.png'), full_page=True)
        print('page errors:', errs)
        await b.close()

asyncio.run(main())
