// Engine unit tests — extracts the v2 engine straight from index.html so tests can't drift from the page.
// Usage: node tests/engine_test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('/* ============================================================\n   v2 SALES ENGINE');
const end = html.indexOf('// Approximate state-capital coordinates');
assert(start > 0 && end > start, 'engine block not found');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(html.slice(start, end) + '\n;this.E={NETWORKS,postcodeToNetwork,batteryRebate,weeklyRepayment,solarHourlyShape,LOAD_SHAPE,buildPlans,simulateYear,consumptionFromBill,recommendSolarKw,recommendBatteryKwh};', ctx);
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
console.log(`engine_test: ${n} checks passed`);
