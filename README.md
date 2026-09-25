# whatifsolar

Solar + battery sales calculator by GridBeater — https://whatifsolar.vercel.app/

Single self-contained page (`index.html`), deployed on Vercel.

## v2 (sales upgrade)
- Modes: **Solar**, **Solar + Battery**, **Add battery** (to existing solar)
- Bill-first: enter the quarterly bill → household usage is backed out, solar/battery sizes recommended
- Hour-by-hour bill model (solar shape, household load, battery dispatch, weather variability)
- Plan comparison on 2026–27 regulated prices: flat Default Offer vs Midday Power Saver (VIC) / Solar Sharer (NSW, SEQ, SA)
- Federal battery rebate (Cheaper Home Batteries, tiered, with the next step-down date as urgency)
- Weekly savings vs weekly finance repayment
- Battery price, STC price, loan rate and term are editable and remembered on the device
- Technical detail (chart, size comparison, method) collapsed by default

## v3 (weekend build, stacked on v2)
- **Three ways to do it** — Good / Better / Best priced options; tap one to switch the quote
- **Customer link** — the whole quote travels in the URL fragment (never sent to a server): the customer sees a clean
  read-only page with exactly the agent's numbers, a **Book my free roof check** button (WhatsApp to the agent) and
  "Prepared by". Set *Your name* and *Your mobile* once in the assumptions panel. The WhatsApp message now includes the link.
- **Adding an EV** tick box (~2,000 kWh/yr, charged in the free window or midday solar)
- **VPP credit** per customer — adds a "VPP battery plan" option to the plan card
- **All states**: TAS (OTTER), regional QLD (Ergon/QCA), NT (Jacana) regulated tariffs; WA buyback (DEBS 2c / 10c 3–9pm);
  WA and ACT flagged to the agent as unconfirmed for 2026–27
- **Agent-only warnings** when prices are unconfirmed or past their valid-until date (30 Jun 2027; rebate data to Dec 2027)
- Not included: open-tracking of links (needs a small database) and bill-photo upload (GridBeater's extractor runs server-side
  with an API key) — both need a decision from the owner.

## Tests
    node tests/engine_test.js          # engine maths, extracted from index.html
    python3 tests/ui_test.py [outdir]  # Playwright: scenarios, mobile, offline fallback (mocks geocoding + NASA)

Reference-price data lives at the top of the engine block in `index.html` (`NETWORKS`, `BATTERY_STC_SCHEDULE`).
Update each 1 July (DMO/VDO) and when the rebate factor steps down (Jan/Jul).
