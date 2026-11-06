# Fun widgets

Open `fun.html` in a browser. It renders every widget at S/M/L on all four solid palette backgrounds (60 cards), with built-in samples, sparse patient records, and empty-data controls. Append `?test=1` for browser interaction and lifecycle checks; the footer reports PASS or FAIL. No package installation is needed.

The preview tries `../registry.js`, then loads its local `registry-stub.js` if the application registry is absent. The stub never replaces an existing registry. Preview assets are development-only.

## Integration

Load the five widget `.css` files with local stylesheet links, and their `.js` files after the application registry. Each JS file registers one id, with S/M/L support:

- `adherence-heatmap`
- `trigger-bubbles`
- `night-moon`
- `change-ticker`
- `air-quality`

Call `render(el, { data, patientId, size, onChange })` on an empty container. The widget clears its own contents on subsequent renders. Call `el.__cleanup?.()` before removing a widget. Render returns nothing. There are no shared widget runtime helpers, imports, Node APIs, or external dependencies.

All colors are widget-scoped CSS variables. Filled-palette styling keeps the host card color visible beneath a translucent teal shade, with white text and large filled calendar cells, bubbles, moons, chips, and pollen bars. Chart colors use white or palette-derived `color-mix()` values. The preview checks at least 4.5:1 white-text contrast for card bodies and enabled buttons on all four fills. Renderers only use local assets and browser APIs, matching the renderer isolation and restrictive CSP approach in [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). No main/preload changes are needed.

## Adapter assumptions for the lead

All schema reads and standalone generators are inside each file's `adaptData(ctx)` function. Replace only that function when the final schema lands.

- A supplied dataset is either a daily record array, `{ entries: [...] }`, or `{ responses: [...] }`. Optional `patientId` filters records; records without it are assumed to already be patient-scoped. No data (`null`/`undefined`) enables deterministic sample data; supplied empty data remains empty.
- Dates use `date` or `timestamp` with an ISO `YYYY-MM-DD` prefix, treated as calendar dates in UTC. Calendar/moon/pollen adapters deduplicate by date (last record wins), fill interior date gaps, and cap history at 90 days. Current streak ends at the final displayed day, not the system date.
- Controller: `controllerTaken`, `controllerMedicationTaken`, or `answers.controllerTaken`; booleans or `yes`/`no`. Missing stays unknown. Ticker also accepts numeric 0/1.
- Triggers: `triggers` or `answers.triggers`, an array of strings or one string. Case-insensitive, one count per trigger per record. More than eight categories become additional filter buttons.
- Waking: `nightWaking`, `nightWakings`, or `answers.nightWaking`; a nonnegative number or boolean/`yes`/`no` (yes = one reported waking). Moons encode reported waking, not astronomy.
- Symptoms: `breathlessness` or `answers.breathlessness` (0–10); rescue use: `rescueInhalerUses`, `rescueUses`, or `answers.rescueInhalerUses`.
- Visit: `patients[].lastVisit` matched by patient id, or patient-scoped `lastVisit`. Records before the visit are compared with records on/after it. Without a visit date, explicitly labelled first-half/second-half comparison is used. Ticker assumes one daily record; absent answers are excluded from means.
- Baseline: `patients[].baseline`, `baselines[patientId]`, or patient-scoped `baseline`, with numeric `breathlessness`. Ticker flags values ≥3 points above it as an illustrative rule. It does not infer a baseline if none is supplied.
- Pollen is **always invented** from the calendar date (0–10), never fetched or presented as a real AQI. Overlay marks a symptom spike the day after pollen ≥7: ≥3 above the supplied baseline, otherwise ≥3 above the prior day's score. It indicates temporal overlap only. Recent strip sizes are 14/28/56 days.

Trigger callback: `{ widgetId: 'trigger-bubbles', type: 'filter', filter: { trigger: 'pollen' /* or null */ }, patientId }`.

Ticker callback: `{ widgetId: 'change-ticker', type: 'highlight', metric: 'breath' /* rescue, waking, taken, breath-spike, or null */, patientId }`.

Selections are local to a render. The host decides how callback events filter or highlight other widgets. Pollen overlay, calendar selection, and night scrub are local interactions.

## Verification

Verified with Chrome opening this preview as a local file under `default-src 'self'`. The interactive browser checks cover registration, S/M/L rendering, day selection, trigger filters, night scrub/pagination, ticker selection and pause, mock pollen overlay, missing dates, patient isolation, empty data, re-renders, actual animation progress, hover pause, and cleanup. Also run with reduced motion enabled. No npm dependencies were added; Electron main/preload/canvas/registry files were not changed.

Latest filled-palette verification: 24 normal-motion checks and 22 reduced-motion checks pass in a real-time Chrome local-file session. Virtual-time Chrome runs are unsuitable for the animation-progress checks.
