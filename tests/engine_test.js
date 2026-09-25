// Engine unit tests — extracts the v2 engine straight from index.html so tests can't drift from the page.
// Usage: node tests/engine_test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('/* ============================================================\n   v2 SALES ENGINE');
const end = html.indexOf('// Approximate state-capital coordinates');
assert(start > 0 && end > start, 'engine block not found');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(html.slice(start, end) + '\n;this.E={OTHER_STATE_TARIFFS,FIT_DEFAULTS,WA_DEBS,EV_KWH_YEAR,NETWORKS,postcodeToNetwork,batteryRebate,weeklyRepayment,solarHourlyShape,LOAD_SHAPE,buildPlans,simulateYear,consumptionFromBill,recommendSolarKw,recommendBatteryKwh};', ctx);
const E = ctx.E;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Rebate vs published examples (Why Solar, $38/STC, factor 6.8): 10→~$2,580, 13.5→~$3,490, 20→~$4,550
const r10 = E.batteryRebate(10, 38, '2026-09-25'), r135 = E.batteryRebate(13.5, 38, '2026-09-25'), r20 = E.batteryRebate(20, 38, '2026-09-25');
ok(near(r10.now, 2580, 60) && near(r135.now, 3490, 60) && near(r20.now, 4550, 60), `rebate ${r10.now}/${r135.now}/${r20.now}`);
ok(r135.next.date === '2027-01-01' && r135.next.drop > 500, 'next step-down 1 Jan 2027');
ok(E.batteryRebate(13.5, 38, '2027-03-01').next.date === '2027-07-01', 'schedule advances');
// Finance: $20k @ 9.49% 7y + $199 est → base ≈ $76/wk, + $2.70 fee
ok(near(E.weeklyRepayment(20000, 0.0949, 7, 2.70, 199), 78.7, 0.5), 'weekly repayment');
// Shapes normalise
ok(near(E.solarHourlyShape(0, -37.8, 'VIC').reduce((a, b) => a + b), 1, 1e-9), 'solar shape sums to 1');
ok(near(E.LOAD_SHAPE.reduce((a, b) => a + b), 1, 1e-9), 'load shape sums to 1');
// Networks
ok(E.postcodeToNetwork('3030') === 'POWERCOR' && E.postcodeToNetwork('2000') === 'AUSGRID' && E.postcodeToNetwork('4870') === null && E.postcodeToNetwork('5000') === 'SAPN', 'network mapping');
// Flat bill with no solar = supply×365 + kWh×rate (Powercor VDO)
const plans = E.buildPlans('POWERCOR', 'VIC', { fit: 0.05 });
const zeros = new Array(12).fill(0);
const b0 = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: 6000, battery: null, lat: -37.9, state: 'VIC', plan: plans[0] }).annualBill;
ok(near(b0, 1.3805 * 365 + 6000 * 0.2822, 3), `flat no-solar bill ${b0}`);
// Bill → consumption inverts exactly (no solar) and by bisection (existing solar)
ok(near(E.consumptionFromBill(600, plans[0]), (2400 - 1.3805 * 365) / 0.2822, 0.5), 'consumption from bill');
const mf = [0.110, 0.099, 0.092, 0.077, 0.062, 0.054, 0.058, 0.072, 0.084, 0.094, 0.098, 0.100];
const g66 = mf.map(f => f * 1300 * 6.6);
const c = E.consumptionFromBill(350, plans[0], g66, -37.9, 'VIC');
ok(near(E.simulateYear({ monthlyGenKwh: g66, annualLoadKwh: c, battery: null, lat: -37.9, state: 'VIC', plan: plans[0] }).annualBill, 1400, 2), 'bisection inverts bill');
// Physical sanity: solar-only saving close to legacy v1 model (±10%); battery self-sufficiency 70–92%
const solar = E.simulateYear({ monthlyGenKwh: g66, annualLoadKwh: 6000, battery: null, lat: -37.9, state: 'VIC', plan: plans[0] });
const legacy = 6.6 * 1300 * 0.3 * 0.2822 + 6.6 * 1300 * 0.7 * 0.05;
ok(near(b0 - solar.annualBill, legacy, legacy * 0.1), `solar saving ${Math.round(b0 - solar.annualBill)} vs legacy ${Math.round(legacy)}`);
const bat = E.simulateYear({ monthlyGenKwh: g66, annualLoadKwh: 6000, battery: { kwh: 13.5, powerKw: 5.4, rte: 0.9 }, lat: -37.9, state: 'VIC', plan: plans[0] });
const ss = 1 - bat.importKwh / 6000;
ok(ss > 0.7 && ss < 0.92, `self-sufficiency ${ss.toFixed(2)}`);
// Free plan: battery never charged beyond daily cap; free kWh ≤ 24/day
const fb = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: 6000, battery: { kwh: 40, powerKw: 10, rte: 0.9 }, lat: -37.9, state: 'VIC', plan: plans[1] });
ok(fb.freeKwh <= 24 * 365 + 1, `free kWh within cap ${Math.round(fb.freeKwh)}`);
// Energy balance: load + charging losses ≈ import − export + generation (within 5%)
const bal = (6000 + 0.3 * 365) - (bat.importKwh - bat.exportKwh + g66.reduce((a, b) => a + b));
ok(bal <= 0 && bal > -0.12 * 6000, `energy balance (losses) ${Math.round(bal)}`);
// Tariffs reproduce the AER's published 2026–27 annual prices (instrument s.8): flat exactly, Solar Sharer within 10% (our load profile is more evening-heavy than the AER's)
const AER = { AUSGRID: [3900, 1899, 1893], ENDEAVOUR: [4900, 2328, 2320], ESSENTIAL: [4600, 2604, 2530], ENERGEX: [4600, 1988, 1914], SAPN: [4000, 2334, 2276] };
for (const k of Object.keys(AER)) {
  const [kwh, flatAnnual, ssoAnnual] = AER[k], net = E.NETWORKS[k];
  const P = E.buildPlans(k, net.state, { fit: 0.05 });
  const lat = { NSW: -33.9, QLD: -27.5, SA: -34.9 }[net.state];
  const f = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: kwh, battery: null, lat, state: net.state, plan: P[0] }).annualBill;
  const sso = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: kwh, battery: null, lat, state: net.state, plan: P[1] }).annualBill;
  ok(near(f, flatAnnual, flatAnnual * 0.003), `${k} flat ${Math.round(f)} vs AER ${flatAnnual}`);
  ok(near(sso, ssoAnnual, ssoAnnual * 0.10), `${k} Solar Sharer ${Math.round(sso)} vs AER ${ssoAnnual}`);
}
// VIC reference (ESC VDO 2026–27 / Midday Power Saver schedule) — spot values
ok(E.NETWORKS.POWERCOR.flat === 0.2822 && E.NETWORKS.POWERCOR.free.bands.peak === 0.4381 && E.NETWORKS.POWERCOR.free.bands.offpeak === 0.2462, 'Powercor reference values');
// Other states: verified regulated flat tariffs (OTTER, QCA/Ergon, Jacana)
ok(E.OTHER_STATE_TARIFFS.TAS.flat === 0.279538 && E.OTHER_STATE_TARIFFS.TAS.supply === 1.676815, 'TAS Tariff 31');
ok(E.OTHER_STATE_TARIFFS.QLD.flat === 0.28895 && E.OTHER_STATE_TARIFFS.QLD.supply === 1.80508, 'Ergon Tariff 11');
ok(!E.OTHER_STATE_TARIFFS.WA.verified && !E.OTHER_STATE_TARIFFS.ACT.verified, 'WA/ACT flagged unverified');
const tasPlan = E.buildPlans(null, 'TAS', { fit: 0.09276, flatRate: 0.279538 });
ok(tasPlan.length === 1 && near(tasPlan[0].supply, 1.676815, 1e-9), 'TAS flat-only plan uses OTTER supply');
// WA DEBS: exports earn 2c except 3–9pm at 10c → effective credit well below a flat 10c
const waFlat10 = E.buildPlans(null, 'WA', { fit: 0.10, flatRate: 0.3237 })[0];
const waDebs = E.buildPlans(null, 'WA', { fit: 0.02, flatRate: 0.3237, fitByHour: E.WA_DEBS })[0];
const gWA = mf.map(f => f * 1600 * 6.6);
const bFlat10 = E.simulateYear({ monthlyGenKwh: gWA, annualLoadKwh: 6000, battery: null, lat: -31.9, state: 'WA', plan: waFlat10 });
const bDebs = E.simulateYear({ monthlyGenKwh: gWA, annualLoadKwh: 6000, battery: null, lat: -31.9, state: 'WA', plan: waDebs });
const effFit = (bDebs.annualBill - (waDebs.supply * 365 + bDebs.importKwh * 0.3237)) / -bDebs.exportKwh;
ok(effFit > 0.02 && effFit < 0.04, `WA DEBS effective export rate ${effFit.toFixed(3)}`);
// EV: adds its kWh to consumption; charging in the free window is cheaper than overnight flat
const evFree = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: 6000, battery: null, lat: -37.9, state: 'VIC', plan: plans[1], extra: { kwhYear: 2000, hours: [11, 12, 13] } });
const noEvFree = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: 6000, battery: null, lat: -37.9, state: 'VIC', plan: plans[1] });
const evFlat = E.simulateYear({ monthlyGenKwh: zeros, annualLoadKwh: 6000, battery: null, lat: -37.9, state: 'VIC', plan: plans[0], extra: { kwhYear: 2000, hours: [22, 23, 0, 1, 2, 3, 4, 5] } });
ok(near(evFlat.importKwh - 6000 * 365.25 / 365, 2000 * 365.25 / 365, 5), 'EV adds ~2,000 kWh');
ok(evFree.annualBill - noEvFree.annualBill < 1, `EV in free window costs ~$0 (${Math.round(evFree.annualBill - noEvFree.annualBill)})`);
console.log(`engine_test: ${n} checks passed`);
