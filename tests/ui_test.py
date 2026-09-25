"""Browser test for whatifsolar v2. Serves the repo locally, mocks geocoding + NASA, drives three sales scenarios.
Usage: python3 tests/ui_test.py [outdir]"""
import json, sys, threading, http.server, socketserver, os, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/wis-shots'
os.makedirs(OUT, exist_ok=True)

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Quiet(Handler.func):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

NOMINATIM = [{"lat": "-37.8983", "lon": "144.7520", "display_name": "Point Cook, Wyndham, Victoria, 3030, Australia",
              "address": {"postcode": "3030"}}]
# Melbourne-west monthly all-sky irradiance, kWh/m²/day (typical NASA POWER climatology)
NASA = {"properties": {"parameter": {"ALLSKY_SFC_SW_DWN": {
    "JAN": 7.05, "FEB": 6.25, "MAR": 4.95, "APR": 3.45, "MAY": 2.35, "JUN": 1.85, "JUL": 2.05,
    "AUG": 2.85, "SEP": 4.05, "OCT": 5.35, "NOV": 6.35, "DEC": 6.95, "ANN": 4.46}}}}

errors = []
def run(page, mode, name, bill, size, battery, loc):
    page.goto(f'http://127.0.0.1:{PORT}/index.html')
    page.click(f'.mode-btn[data-mode="{mode}"]')
    page.fill('#customerName', name)
    page.fill('#bill', bill); page.fill('#size', size)
    if mode != 'solar': page.fill('#battery', battery)
    page.fill('#location', loc)
    page.click('#calculateBtn')
    page.wait_for_selector('#confirmCard.show', timeout=8000)
    page.click('#confirmYes')
    page.wait_for_selector('#results.show', timeout=8000)
    page.wait_for_timeout(1200)
    return page.evaluate('''() => ({
      hero: document.getElementById('heroGenKwh').textContent,
      heroLead: document.getElementById('heroBillLead').textContent,
      heroSave: document.getElementById('heroSavings').textContent,
      payback: document.getElementById('heroPayback').textContent,
      coverage: document.getElementById('coveragePhrase').textContent,
      meta: document.getElementById('metaSize').textContent,
      billLabel: document.getElementById('dealBillLabel').textContent,
      from: document.getElementById('dealBillFrom').textContent, to: document.getElementById('dealBillTo').textContent,
      sub: document.getElementById('dealBillSub').textContent,
      save: document.getElementById('dealSaveWk').textContent, repay: document.getElementById('dealRepayWk').textContent,
      net: document.getElementById('dealNetWk').textContent, verdict: document.getElementById('dealVerdict').textContent,
      price: document.getElementById('dealPrice').textContent, urgency: document.getElementById('dealUrgency').textContent,
      plans: [...document.querySelectorAll('.plan-row')].map(r => r.innerText.replace(/\\n+/g,' | ')),
      tip: document.getElementById('planTip').textContent, foot: document.getElementById('planFoot').textContent,
      network: document.getElementById('networkSelect').value,
      share: buildShareMessage(currentResult),
      load: Math.round(currentResult.deal.load), selfSuff: currentResult.deal.selfSufficiency
    })''')

with sync_playwright() as p:
    b = p.chromium.launch()
    for vp_name, vp in [('desktop', {'width': 1280, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if vp_name == 'mobile' else 1)
        ctx.route('**nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(NOMINATIM)))
        ctx.route('**power.larc.nasa.gov/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(NASA)))
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(f'{vp_name} console.{m.type}: {m.text}') if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(f'{vp_name} pageerror: {e}'))
        scenarios = [
            ('solarBattery', 'Sarah', '650', '', '', 'Point Cook'),
            ('solar', 'Raj', '', '6.6', '', '3030'),
            ('addBattery', 'Mei', '380', '6.6', '', '3030'),
        ]
        for sc in scenarios:
            res = run(page, *sc)
            if vp_name == 'desktop':
                print('\n=== ', sc[0], sc[1:]); print(json.dumps(res, indent=1, ensure_ascii=False))
            tag = f'{vp_name}-{sc[0]}'
            page.locator('.top-section').screenshot(path=f'{OUT}/{tag}-top.png')
            if sc[0] == 'solarBattery':
                page.screenshot(path=f'{OUT}/{tag}-inputs.png', full_page=False) if False else None
                page.evaluate("window.scrollTo(0,0)")
                page.locator('.input-section').screenshot(path=f'{OUT}/{tag}-inputs.png')
                # customer-facing screenshot framing
                page.evaluate("document.body.classList.add('screenshot-top')")
                page.wait_for_timeout(300)
                page.locator('.container').screenshot(path=f'{OUT}/{tag}-customer-view.png')
                page.evaluate("document.body.classList.remove('screenshot-top')")
        if vp_name == 'desktop':
            # Settings persist: edit loan rate, reload scenario, check it stuck
            page.click('#editLoanRate'); page.keyboard.press('Control+A'); page.keyboard.type('6.99'); page.keyboard.press('Enter')
            page.wait_for_timeout(300)
            after = page.evaluate("[document.getElementById('editLoanRate').textContent, document.getElementById('dealRepayWk').textContent, localStorage.getItem('whatifsolar_settings_v2')]")
            print('\n=== loan edit ->', after)
            # Network switch
            page.select_option('#networkSelect', 'AUSNET'); page.wait_for_timeout(300)
            print('=== network AUSNET ->', page.evaluate("[document.getElementById('editRetail').textContent, document.getElementById('dealBillTo').textContent, [...document.querySelectorAll('.plan-row')].map(r=>r.innerText.replace(/\\n+/g,' | '))]"))
            # More-details opens and chart renders
            page.click('#moreDetails > summary'); page.wait_for_timeout(900)
            print('=== chart svg present:', page.evaluate("!!document.querySelector('#monthlyChart svg')"), '| compare cards:', page.evaluate("[...document.querySelectorAll('.compare-card')].map(c=>c.innerText.replace(/\\n+/g,' '))"))
            # Mode live-switch on existing result
            page.click('.mode-btn[data-mode="solar"]'); page.wait_for_timeout(300)
            print('=== live switch to solar:', page.evaluate("[document.getElementById('metaSize').textContent, document.getElementById('dealBillTo').textContent]"))
        if vp_name == 'desktop':
            # Compare cards in solar + battery mode
            res = run(page, 'solarBattery', 'Sam', '700', '10', '13.5', '3030')
            page.click('#moreDetails > summary'); page.wait_for_timeout(700)
            print('=== compare cards (solar+battery):', page.evaluate("[...document.querySelectorAll('.compare-card')].map(c=>c.innerText.replace(/\\n+/g,' '))"))
            print('=== verdict/net:', res['verdict'], '|', res['net'])
            # Switching to Add battery must clear the old result
            page.click('.mode-btn[data-mode="addBattery"]'); page.wait_for_timeout(200)
            print('=== results hidden after switch to addBattery:', page.evaluate("!document.getElementById('results').classList.contains('show')"))
        ctx.close()
    # Offline: geocoders + NASA down → bare postcode still works, other states
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    ctx.route('**nominatim.openstreetmap.org/**', lambda r: r.abort())
    ctx.route('**photon.komoot.io/**', lambda r: r.abort())
    ctx.route('**power.larc.nasa.gov/**', lambda r: r.abort())
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'offline pageerror: {e}'))
    for pc, bill in [('2150', '700'), ('4870', '600'), ('6000', '650'), ('5000', '800')]:
        res = run(page, 'solarBattery', '', bill, '', '', pc)
        print(f'=== offline {pc}:', res['meta'], '|', res['from'], '->', res['to'], '|', res['save'], '/', res['repay'], '|', res['plans'], '|', res['tip'][:80])
    page.locator('.top-section').screenshot(path=f'{OUT}/offline-SA-top.png')
    ctx.close()
    b.close()
print('\nERRORS:', errors or 'none')
httpd.shutdown()
