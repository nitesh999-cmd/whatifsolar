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

## Tests
    node tests/engine_test.js          # engine maths, extracted from index.html
    python3 tests/ui_test.py [outdir]  # Playwright: scenarios, mobile, offline fallback (mocks geocoding + NASA)

Reference-price data lives at the top of the engine block in `index.html` (`NETWORKS`, `BATTERY_STC_SCHEDULE`).
Update each 1 July (DMO/VDO) and when the rebate factor steps down (Jan/Jul).
