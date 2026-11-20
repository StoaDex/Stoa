"""UI end-to-end on anvil: connect a test wallet, approve + swap USDC->HYPE (with referral), then HYPE->MEME (imported token)."""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ADDR = json.load(open(os.path.join(HERE, '..', '..', 'contracts', 'localapp.json')))
TRADER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
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
        await pg.goto(f'{APP}/trade?ref={REF}')
        await pg.wait_for_timeout(2500)

        await pg.click('header .cta')
        await pg.click('.wl button:has-text("Test Wallet")')
        await pg.wait_for_selector('text=Your wallet')
        await pg.click('button[aria-label="Close"]')

        hype0 = int(cast('balance', TRADER))
        if not await pg.query_selector('#sellv'):
            await pg.screenshot(path=os.path.join(HERE, 'err.png')); print('PAGE ERRORS:', errs); print((await pg.inner_text('body'))[:500])
        await pg.fill('#sellv', '100')
        await pg.wait_for_selector('button.big:has-text("Approve 100 USDC")', timeout=15000)
        print('quote shown:', await pg.inner_text('.det'))
        await pg.click('button.big:has-text("Approve 100 USDC")')
        await pg.wait_for_selector('.ok:has-text("confirmed")', timeout=20000)
        allowance = cast('call', ADDR['usdc'], 'allowance(address,address)(uint256)', TRADER, ADDR['router'])
        print('allowance after approve (exact amount expected 100000000):', allowance)
        await pg.wait_for_selector('button.big:has-text("Swap")', timeout=15000)
        await pg.click('button.big:has-text("Swap")')
        await pg.wait_for_selector('.ok:has-text("Swap confirmed"), .err', timeout=20000)
        if await pg.query_selector('.err'): print('ERROR:', await pg.inner_text('.err')); await pg.screenshot(path=os.path.join(HERE, 'err.png')); raise SystemExit(1)
        hype1 = int(cast('balance', TRADER))
        print('USDC->HYPE: trader HYPE change (wei, incl. gas):', hype1 - hype0)
        owed = cast('call', ADDR['fees'], 'referralOwed(address,address)(uint256)', REF, ADDR['whype'])
        print('referrer owed (WHYPE wei):', owed)
        await pg.screenshot(path=os.path.join(HERE, 'ui-swap1.png'))

        # HYPE -> MEME via token import
        await pg.click('#sellv'); await pg.fill('#sellv', '')
        await pg.click('.box >> nth=0 >> button.tok')
        await pg.click('.tokm button:has-text("HYPE") >> nth=0')
        await pg.click('.box >> nth=1 >> button.tok')
        await pg.fill('.tokm input', ADDR['meme'])
        await pg.click('.tokm button:has-text("Import")')
        await pg.fill('#sellv', '1')
        await pg.wait_for_selector('text=not verified by Stoa', timeout=15000)
        await pg.click('label.chk:has-text("I checked the token address") input')
        await pg.wait_for_selector('button.big:has-text("Swap")', timeout=15000)
        print('quote shown:', await pg.inner_text('.det'))
        await pg.click('button.big:has-text("Swap")')
        await pg.wait_for_selector('.ok:has-text("Swap confirmed"), .err', timeout=20000)
        if await pg.query_selector('.err'): print('ERROR:', await pg.inner_text('.err')); await pg.screenshot(path=os.path.join(HERE, 'err.png')); raise SystemExit(1)
        meme = cast('call', ADDR['meme'], 'balanceOf(address)(uint256)', TRADER)
        print('HYPE->MEME: trader MEME balance (wei):', meme)
        await pg.screenshot(path=os.path.join(HERE, 'ui-swap2.png'))
        print('page errors:', errs)
        await b.close()

asyncio.run(main())
