# SMART@Home Clinician Data-View — Project Guide

This file is the reference for what the project is, what we decided, and how the repo is organized. Read it before making changes. Update it when decisions or repo contents change.

## What we know

### The platform
- SMART@Home (Self-Management Assistance for Recommended Treatment at Home) is a digital health platform built at Cincinnati Children's Hospital Medical Center.
- It helps patients manage chronic and complex conditions at home (for example asthma, inflammatory bowel disease, and migraine) from one unified app, instead of a separate tool per condition.
- Patient-entered data flows into the Epic EHR, so it can sit alongside the rest of the clinical record.
- It builds on more than 20 years of adherence research. Techniques include positive reinforcement, gamification, and reminders.
- Trackers and care logic are co-designed by the patients and clinicians who use them.
- Clinicians configure condition-specific trackers in a no-code interface. New trackers deploy in minutes and can be updated quickly from patient feedback.

### How it is used today
- On the clinician side, SMART@Home is a no-code app. Clinicians use it to generate questionnaires and surveys.
- Questions use radio buttons, sliders, text entry, and similar input types.
- The goal is to track a patient's health over time without needing to see them in person all the time.
- The method is self-report: patients answer the questions at home.
- Doctors generate each questionnaire for a specific patient group, such as everyone with a given condition.

### The problem
- SMART@Home now collects rich patient data.
- On the clinician side, that data arrives as raw rows in a table.
- The table is not practical to use during a visit. A clinician must scan many rows to work out what happened since the last visit.

Situations where the current view falls short:
- Time is short. The clinician needs a "what changed and what matters now" view immediately.
- Different specialists need different levels of detail from the same patient data.
- The team needs to compare a patient's status and responses over time. This is hard with row-based data.

### Scope
- The challenge is to design the clinician data view only. It is not a redesign of the whole platform.
- Starting point: the existing tabs (Patients, Trackers, Studies) and per-patient logs.
- Official deliverable: a wireframe the clinician data view. The brief says it should be informed by clinician interviews provided by the organizers. We have no interview material, so design decisions below come from the team.
- Our chosen output: an interactive Electron prototype with mock patient data. It goes beyond a static wireframe and doubles as the demo.
- Out of scope: the patient-side app itself, including how patients fill in questionnaires. Patient input types are listed below only to show what data shapes to expect.
- In scope on the patient side: the body diagram data. We define how a body-diagram report looks as data, so the clinician view can display it.

### Users and views
The prototype has two distinct views, because the same data serves two audiences with different goals.
- **Clinician view.** Used during and around a patient visit. Needs speed, a clear signal of what changed, and support for treatment decisions. Detail depth varies by specialty. It has two modes, described next.
- **Researcher view.** Used to study data across patients and trackers (this maps to the existing Studies tab). Needs aggregate and cohort-level comparison rather than single-visit speed. The exact contents are still to be defined.

### The two clinician modes
1. **Full data view.** Shows all recorded data for a patient in a neat, organized layout.
   - The clinician customizes it with drag and drop.
   - They can visualize any recorded data point, for example over time, and choose the chart type and layout.
   - This is the deep-review mode. It replaces the raw table.
2. **Flashcard view.** A quick-glance deck of cards that tells the clinician what to focus on.
   - Built for the moments before a visit, for example on the way to the patient's room.
   - Each card is one thing that changed or needs attention. The clinician can flip through them in seconds.
   - This is the pre-flight view described under design choices.

### Body diagram
- Patients report pain or discomfort by tapping a body diagram. For example, "Oh, it hurts here", then they tap the neck.
- The clinician does not see this as a separate feature. It appears inside the full data view, next to the other visualizations.
- Design implications:
  - Store each report as a body region, a timestamp, and optionally an intensity or note.
  - Show the current report and history. For example, highlight regions on the diagram and let the clinician step through time.
  - Allow it to be treated like any other data source: draggable into a layout and usable as a flashcard when something changed.

### Clinician preferences
This section records what clinicians tell us they want. It is the place to capture clinician feedback and preferences as we learn them. Add to it whenever a clinician states a preference, and note who said it and which specialty they are in.

Preferences from clinicians so far: none recorded yet.

Template for each entry:
- **Preference:** what the clinician wants to see or do.
- **Specialty / role:** who said it.
- **Why:** the reason they gave.
- **Where it applies:** flashcard view, full data view, or both.

In the app, a clinician's settings are stored in `data/preferences.json`. The file is the machine-readable version of this section.
- It holds the settings the clinician controls, such as which charts and cards appear, their order and layout, the default time range, and which flashcards are shown first.
- Both views read it on startup and write it back when the clinician rearranges something. This makes drag-and-drop layouts persist.
- Keep one entry per clinician, keyed by a clinician id, with an optional per-specialty default.
- For the demo it is a plain JSON file. The main process reads and writes it and exposes it to the renderer through `window.api`. The renderer never touches the file system.

### Open questions raised in the brief
- What does a clinician need to see in the first 30 seconds of opening a patient's record?
- Which data points drive treatment decisions, and which are noise?
- How do needs differ across specialties viewing the same data?
- How should the view support verifying adherence, spotting trends, flagging anomalies, and guiding treatment?

### Context
- Digital Health Hackathon 2026, Innovation Ventures, Cincinnati Children's Hospital Medical Center.
- Principal Investigators: Kevin Hommel, Matt Wortman, Rachel Ramsey.

### Trackers
- Doctors build trackers with drag and drop.
- Trackers can be built for patient groups, not only for individuals.

## App design choices

### Look and feel
- Heavy UI inspiration from the How We Feel app.
- UI is built in Electron.js. A voice interface was considered and dropped.
- Reactive and constantly moving: the view updates live and feels alive, not static.
- Make a mascot.

### Clinician view
- Drag-and-drop visuals and setup. Clinicians arrange which charts and cards they see.
- Pre-flight and regular views. Pre-flight is a quick pre-visit summary. The regular view is the full view for deeper review.
- Post-game interview. A structured debrief after the visit that connects patient and provider (P ↔ P).

### Intelligence
- A generalized ML model for anomaly detection and prediction. It works across trackers rather than per condition.
- "Calibrate": the model adjusts to each patient's own baseline, so an anomaly means unusual for that patient, not unusual for the population.
- In the prototype this is mocked. Use hard-coded or generated anomaly flags unless a real model is built.

### Patient-side inputs
- Question types: multiple choice, radio buttons, sliders, text entry. The patient-side UI for these is outside scope. Use them only as mock data shapes.
- Interactive body diagram: "touch and point to where it hurts." The data it produces is in scope, because the clinician sees it in the full data view.

## Color palette

| Hex | Name used in CSS |
|---|---|
| `#772152` | `--plum` |
| `#0091b7` | `--blue` |
| `#619a3c` | `--green` |
| `#244946` | `--teal` |

Use these as the base brand colors. Define any new color as a CSS variable in `styles.css`, not as a hard-coded value.

## Repo contents

```
CLAUDE.md            project guide (this file)
README.md            stub, title only
package.json         scripts: `npm start` runs `electron .`; entry point `src/main.js`
package-lock.json    locked dependency versions
.gitignore           node_modules/, dist/, out/
src/
  main.js            isolated BrowserWindow (390x844 phone-sized, min 320x568); validated getData/getPrefs/savePrefs IPC handlers
  data.js            normalizeData(): turns responses.json {surveys, patients, responses} into {survey, surveys, patients, entries, period}
  preload.js         exposes only window.api.getData(), getPrefs(), savePrefs(layout)
  preferences.js     validated, serialized, atomic saves to userData/preferences.json
  renderer/
    index.html       local scripts/styles, CSP default-src 'self', patient selector and canvas shell
    styles.css       filled palette cards/blobs/pills, contrast-safe white text, serif headings, S/M/L grid
    renderer.js      starts canvas and reports startup failures
    nav.js           bottom dock: Fly / Anomalies / Data page switching and transitions
    canvas.js        hamburger tray drawer, HTML5 drag/reorder, sizes, remove, patient changes, persistence
    lib/
      svg.js         shared SVG scale, path, and tick helpers
    widgets/
      registry.js    window.Widgets register/list/get extension API
      hello.js       placeholder patient check-in widget, all three sizes
      survey-widgets.js/.css  the seven default widgets, driven by survey answers: checkin-count, breathlessness-trend, night-rescue-trend, kpi-board, symptom-frequency, symptom-timing, activity-limit-trend
      trend-line.js/.css  patient trend chart with calibration band and mock live updates
      kpi-tiles.js/.css   weekly indicators with deltas, sparklines, flip details
      scatter.js/.css     metric comparison with week colours and selection
      body-diagram.js/.css  interactive asthma body map with history scrubber
      lungs-gauge.js/.css   severity-paced breathing lungs
      adherence-heatmap, trigger-bubbles, night-moon, change-ticker, air-quality (.js/.css)  fun widgets
      (trend-line through air-quality were written for the older data shape: baselines, bodyReports, controller_taken. They are still in the tray but are NOT yet connected to the current schema.)
      _dev/               standalone mock-data previews per widget group
data/
  responses.json     single source of truth: one asthma-daily survey, one patient (pt-a1), 100 daily responses (2026-07-28 to 2026-11-04) with planted anomalies
  preferences.json   resolution rules (patients > surveys > general) for clinician clin-001, plus activeClinicianId and the default 7-widget layout
  legacy-demo/       the earlier 6-patient dataset and old preferences; not loaded by the app
tests/
  foundation.test.js preference store and registry tests (its dataset test still targets the removed data/survey.json and needs rewriting)
scripts/
  verify-electron.js      launches two disposable-profile Electron test processes
  verify-electron-app.js  bridge, HTML5 events, canvas controls, and restart smoke checks
```

## Architecture and tech stack

- Electron (dev dependency), plain JavaScript. No bundler, no framework, no tests yet.
- Main process (`src/main.js`) owns windows and anything that needs Node or the OS.
- Preload (`src/preload.js`) is the only bridge. Expose narrow, named functions on `window.api`. Never expose `ipcRenderer` or Node modules directly.
- Renderer (`src/renderer/`) is the UI. It has no Node access.
- Security settings: `contextIsolation: true`, `nodeIntegration: false`, and a CSP in `index.html`. The CSP blocks inline scripts and remote resources. Keep scripts and styles in separate local files.
- Run the app with `npm start`.

### Data flow
- `data/responses.json` holds `{ surveys, patients, responses }`. Each response is `{ id, surveyId, patientId, submittedAt, answers }`. Answers use the survey's question ids: radio values are `"Yes"`/`"No"`, mcq values are arrays of option labels (`["None"]` means no symptoms), sliders are numbers, text is a string.
- Main process reads it through `src/data.js` (`normalizeData`) and returns `{ survey, surveys, patients, entries, period }` from `window.api.getData()`. `entries[]` is `{ id, patientId, surveyId, date, timestamp, answers }`, sorted by time. There are no `baseline` or `bodyReports` fields in this schema; widgets compute per-patient baselines themselves (mock rule: mean + 2 SD).
- Widgets filter `data.entries` by `ctx.patientId` and the survey id. The canvas passes `{ data, patientId, size, onChange }`.
- Default layout (in `data/preferences.json` under `clinicians.clin-001.layout`, active via `activeClinicianId`): check-in count (S), breathlessness trend (L), night waking and rescue inhaler 7-day counts (L), KPI board (M), symptom frequency (M), symptoms by week heatmap (L), activity limitation trend with weekly rate of change (L). The writable copy in userData is only seeded once, so delete it to pick up changes to the bundled layout.

## Status and next steps

- Current state: foundation (isolated IPC, persistent canvas, patient selector, widget registry) plus the single-patient, 100-record asthma dataset and seven default widgets wired to it. WIDGET-API.md still describes the older data shape (baseline, bodyReports, 6 patients); the Data flow section above is current.
- Known gaps: the older widgets (trend-line, kpi-tiles, scatter, body-diagram, lungs-gauge, fun widgets) are not connected to the new schema. `WIDGET-API.md` still describes the old data shape.
- Cards: clicking a card body opens it enlarged in a modal (re-rendered at size L, charts sized to real pixels). The `kpi` widget shows one variable per card (chosen with its dropdown, saved in `config.metric`); consecutive KPI cards are grouped: stacked vertically on phones (under 641 px) and in one horizontal row in a wide browser window. Chart cards pair up (M = half width) on wide windows and go full width on phones. The default layout is four KPI cards (check-ins, avg breathlessness, peak, top symptom) plus five charts; bumping `layoutVersion` in `data/preferences.json` replaces an older saved layout.
- Pages: a floating frosted-glass dock at the bottom (`#dock`, `nav.js`) switches between Fly, Anomalies and Data with slide/fade transitions. Data is the widget canvas described above (the in-depth summary). Fly (the flashcard / pre-flight view) and Anomalies are empty placeholders for now.
- Layout: the window is phone-sized and the page fits its width with no horizontal scroll (single-column cards under 640 px). The top bar is a sticky, floating, glossy translucent pill: hamburger plus a patient-name button (`#patient-button`) that opens a patient dropdown (no wordmark or mock-data badge). The widget tray is an off-canvas drawer opened from the header hamburger (`#tray-toggle`); it slides away during a drag so the canvas is the drop target. `npm test` and `npm run verify:electron` pass against the single-patient dataset.
- Earlier verification (old dataset): npm test and npm run verify:electron passed. npm start opened the desktop app; Add, S sizing, and button reordering were observed. HTML5 drag handlers, S/M/L, removal, patient switching, and persistence across separate processes pass in Electron. Native pointer drag automation did not trigger a drop; a manual pointer-drag check remains outstanding.
- Likely next steps:
  1. Create the demo dataset (see "Demo dataset" below).
  2. Create `data/preferences.json` with a default layout for one demo clinician, and wire load and save through the main process and preload.
  3. Build the flashcard view (what changed, what matters now) from the demo data.
  4. Build the full data view with trend charts, the body diagram, and a drag-and-drop layout saved to `preferences.json`.
  5. Add the researcher view over the same mock data.
  6. Add mascot and live-update motion.
- Decide early whether to introduce a framework or chart library. Plain JS is fine for the first screens but will get heavy with drag-and-drop and live charts.

## Demo dataset

Current state: one asthma survey, one patient, 100 daily records in `data/responses.json`. Planted anomalies: a 3-day breathlessness spike (records 39-41), single-day spikes (56, 89), a night-waking cluster (63-65), and a 5-day flare (72-76). The older six-patient cohort lives in `data/legacy-demo/`.

For the demo we use fake data from one survey. Everything is invented. No real patient data.
- **Survey:** 5 to 6 questions that a doctor has pushed to patients with asthma. Mix the input types: sliders, radio buttons, multiple choice, and one free-text question.
- **Example questions** (adjust as needed): breathlessness this week (slider 0 to 10), rescue inhaler uses today (number or radio buttons), night-time waking (radio buttons: yes or no), daily controller medication taken (yes or no), triggers noticed (multiple choice), and an optional free-text note. The body diagram may also be included, for example chest or throat discomfort.
- **Patients:** a small cohort, around 5 to 8 patients, with entries over several weeks.
- **Patterns to build in on purpose**, so the views have something to show: one patient with a worsening trend, one with missed days (adherence gap), one with a sudden spike (anomaly), and one stable patient.
- **Location:** `data/responses.json` holds the survey definitions, patients, and responses together.
- Design the data so more surveys can be added later. Do not hard-code asthma into the view code.

## Working conventions

- Keep changes small and runnable. Confirm the app still starts with `npm start` after each change.
- Keep the clinician view focused on glanceable signal. Prefer showing change and anomaly over raw values.
- Use mock data only. Never add real patient data to the repo.
- Update the "Repo contents" and "Status" sections of this file whenever files or progress change.


---

## Shawn update (2026-11-06)

Everything above is the team's text and is unchanged. This section records what Shawn built and decided on `main` today. Where it differs from the sections above (for example Repo contents and Status), this section is newer.

### What was built
- **Widget canvas** in `src/renderer/`: tray, HTML5 drag/reorder, S/M/L sizes, remove, patient picker, widget registry (`window.Widgets.register({ id, title, sizes, render(el, ctx) })`, `ctx = { data, patientId, size, onChange }`). Layout saves per clinician through `window.api.savePrefs` and persists across restarts. Contract in `WIDGET-API.md`.
- **Ten widgets**, one `.js` (+ `.css`) each in `src/renderer/widgets/`, all loaded in `index.html`: `trend-line` (calibrate band, anomaly dots), `kpi-tiles`, `scatter`, `body-diagram` (nose/sinus, throat, chest, left/right lung, history scrubber), `lungs-gauge`, `adherence-heatmap`, `trigger-bubbles`, `night-moon`, `change-ticker`, `air-quality` (mock). Plus `hello` placeholder. Standalone previews live in `widgets/_dev/`.
- **IPC** (`src/main.js`, `src/preload.js`, `src/preferences.js`): `getData`, `getPrefs`, `savePrefs` only, validated, atomic saves in `userData`.
- **Tests:** `tests/foundation.test.js`, `scripts/verify-electron*.js`.
- **Docs:** `DESIGN-BRIEF.md` (How We Feel reference notes), `WIDGET-API.md`, `README.md`.

### Look
- White page background. The hero banner ("FULL DATA VIEW / A little context. A clearer picture.") was removed.
- Only the four palette colours are used. Everything else is white or derived with `color-mix()`; no other hex values. Base neutrals in `src/renderer/styles.css`: `--ground` white, `--deep` (teal 22% on black), `--surface`, `--card`, `--ink` (teal), `--muted`, `--line` (tints of teal on white), `--accent` (plum).
- Widget cards are large solid fills cycling plum, blue, green, teal with white text. The canvas sets `--widget-palette` per card; widgets draw with white and tints of it.

### Data decision
- The team's data (rai1975, PR #1) in `data/responses.json` and `data/preferences.json` is the only data the app should use. Do not edit those files.
- Our earlier generated data was moved to `data/legacy-demo/` (`survey.json`, `responses.json`, `preferences.json`: 6 patients, 245 entries over 42 days) as reference and test fixture. `WIDGET-API.md` and the current app code still describe that old format.

### Known problems
1. **The app on `main` is broken.** `src/main.js` reads `data/survey.json` and `data/responses.json` in our old format, and uses `data/preferences.json` (now the team's layered settings) as the widget-layout default. Expect `npm start`, `npm test` and `npm run verify:electron` to fail until a data adapter exists (not re-run after the data move). Last commit with a working app: `7db417f`.
2. **Widgets that ignored the patient** (found by rendering every widget for all six old-data patients and comparing output): `kpi-tiles` and `scatter` show built-in sample data; `trend-line` differs for only 3 of 6 patients; `adherence-heatmap` and `night-moon` are identical for every patient. Working: `body-diagram`, `lungs-gauge`, `trigger-bubbles`, `change-ticker` (5/6), `air-quality` (mock). Cause: each widget's `adaptData()` guessed field names and ships a random sample fallback.
3. **Team data changed after this update was first written** (rai1975, commit `3dc7db0`): `data/responses.json` now holds one survey (`asthma-daily`, 7 questions, now including `breathlessness`), one patient (`pt-a1`) and 100 responses from 2026-07-28 to 2026-11-04. That is enough for trends, baselines and heatmaps for that one patient, but there is no cohort, no second survey and no body-diagram reports. The earlier 10-patient, 2-responses-each version is gone. Multi-patient views (patient picker, researcher view) have nothing to compare until more patients are added; undecided whether rai1975 adds them or we add clearly labelled generated rows in a separate file.
4. **Real mouse drag-and-drop is untested.** Handlers, sizes, removal and persistence pass in Electron automation; native pointer drag has not been tried by hand.

### Next step (not started)
- `src/dataAdapter.js` (pure, tested): team format to the `getData()` shape, baselines computed from the data (flag n < 3 as sparse, no calibrate band), and a `resolve(clinicianId, patientId, surveyId)` helper for the patient > survey > general preferences.
- Move the widget-layout default to `data/layout-defaults.json`.
- Make widgets read by question type (slider = main metric, radio = yes/no, mcq = category), add "not enough entries yet" and "no body-diagram reports" states, remove sample fallbacks from the real path.
- A Copilot attempt was stopped; its partial uncommitted edits are in the local Orca worktree `team-data-copilot` and were never merged.

### Still to build
Flashcard (pre-flight) view, researcher view, post-game interview. The mascot belongs to someone else; do not build it.

### How to run
- `npm start`, `npm test`, `npm run verify:electron`.
- In a Claude Code or VS Code terminal `ELECTRON_RUN_AS_NODE=1` is set and Electron crashes with "Cannot read properties of undefined (reading 'setPath')". Use `env -u ELECTRON_RUN_AS_NODE npm start` there.

### Branches
Work is on `main`. `feat/widgets` was merged into `main` and still exists on GitHub with the same content; it can be deleted. Worker branches were never pushed.

### Agent workflow notes
Workers (Copilot, Codex) were run through Orca (stablyai). CLI: `C:\Users\shawn\AppData\Local\Programs\orca\resources\bin\orca.exe`, not on PATH; this repo is registered in Orca. Copilot stops at a folder-trust prompt (answer with `terminal send --text 1`, then a separate `--enter`). Codex "Hook failed" lines come from claude-mem and are harmless; Codex hit its 5-hour limit and was moved to GPT-6.1-Sol medium. Agent output felt generic, so prefer small reviewed changes over large delegated ones.


## Aero assistant (added 2026-11-06)

Aero is the mascot, built as a talking assistant. This reverses the earlier "voice interface dropped" note: voice is back, for Aero only.

- **What it does:** a small crane fixed at the bottom-right that you can drag anywhere. Tap him and talk; he answers aloud and in a text bubble above him. He greets with updates and anomalies when a patient is selected.
- **How:** Cartesia handles speech (sonic-3 text-to-speech, ink-whisper speech-to-text). `claude-haiku-5-5` does the reasoning and calls tools over the patient data. Both calls run in the main process only; the renderer never sees keys.
- **Keys:** copy `.env.example` to `.env` (git-ignored) and fill in `ANTHROPIC_API_KEY`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`. Without them Aero shows as asleep or text-only.
- **Files:**
  - `src/aero/llm.js`: Haiku tool loop, personality prompt, mood tag parsing.
  - `src/aero/cartesia.js`: text-to-speech and speech-to-text.
  - `src/aero/tools.js`: the lookups Aero can call (changes, anomalies, trend, body reports, adherence).
  - `src/aero/realSource.js`: answers those lookups from the team data (generic by question type; anomalies are simple per-patient statistics, not a trained model).
  - `src/aero/dataSource.js`: the interface plus a placeholder source for tests.
  - `src/aero/ipc.js`: IPC handlers and `.env` loading.
  - `src/renderer/aero.js` and `aero.css`: the character, bubble, tap-to-talk and drag. Poses are chosen by SVG filename in `src/renderer/assets/aero/`.
  - `tests/aero.test.js`: unit tests with mocked network calls.
- **Known gaps:** Cartesia emotion names are best guesses (the API accepts any name). Replies wait a few seconds; streaming the reply into the voice would help. The patient is read from the page's custom picker (`#patient-menu`), so changes to that markup will break Aero's patient detection.
