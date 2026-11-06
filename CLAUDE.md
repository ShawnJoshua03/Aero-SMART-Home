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

Use these as the base brand colors. The canvas gives each widget a solid fill from this palette and sets `--widget-palette` to that color token. Widget charts use white and `color-mix()` tints or shades of `--widget-palette`; do not add new hex colors. Keep widget-specific color variables in that widget's CSS file.

## Repo contents

```
CLAUDE.md            project guide (this file)
README.md            stub, title only
package.json         scripts: `npm start` runs `electron .`; entry point `src/main.js`
package-lock.json    locked dependency versions
.gitignore           node_modules/, dist/, out/
src/
  main.js            main process: creates a 1280x800 BrowserWindow, loads renderer/index.html
  preload.js         contextBridge exposes `window.api.versions` to the renderer
  renderer/
    index.html       page shell, CSP `default-src 'self'`, header and `#app` mount point
    styles.css       CSS variables for the four palette colors, basic header and main styling
    renderer.js      placeholder: prints Electron and Chrome versions into `#app`
    lib/
      svg.js         shared SVG scale, path, and tick helpers
    widgets/
      trend-line.js  patient trend chart with calibration band and mock live updates
      trend-line.css trend chart styles and motion
      kpi-tiles.js   weekly indicators with deltas, sparklines, and flip details
      kpi-tiles.css  KPI widget styles and motion
      scatter.js     interactive metric comparison with week colours and selection
      scatter.css    scatter widget styles
      _dev/
        charts.html  standalone mock-data preview for S/M/L widget sizes
        registry-stub.js, showcase.js, showcase.css  local preview harness
```

## Architecture and tech stack

- Electron (dev dependency), plain JavaScript. No bundler, no framework, no tests yet.
- Main process (`src/main.js`) owns windows and anything that needs Node or the OS.
- Preload (`src/preload.js`) is the only bridge. Expose narrow, named functions on `window.api`. Never expose `ipcRenderer` or Node modules directly.
- Renderer (`src/renderer/`) is the UI. It has no Node access.
- Security settings: `contextIsolation: true`, `nodeIntegration: false`, and a CSP in `index.html`. The CSP blocks inline scripts and remote resources. Keep scripts and styles in separate local files.
- Run the app with `npm start`.

## Status and next steps

- Current state: three chart/KPI widgets and a standalone mock-data preview are implemented. The widget data adapters use provisional field matching pending the finalized survey schema. Registry/canvas integration, patient data, clinician views, researcher view, and automated tests remain to be built.
- Likely next steps:
  1. Create the demo dataset (see "Demo dataset" below).
  2. Create `data/preferences.json` with a default layout for one demo clinician, and wire load and save through the main process and preload.
  3. Build the flashcard view (what changed, what matters now) from the demo data.
  4. Build the full data view with trend charts, the body diagram, and a drag-and-drop layout saved to `preferences.json`.
  5. Add the researcher view over the same mock data.
  6. Add mascot and live-update motion.
- Decide early whether to introduce a framework or chart library. Plain JS is fine for the first screens but will get heavy with drag-and-drop and live charts.

## Demo dataset

For the demo we use fake data from one survey. Everything is invented. No real patient data.
- **Survey:** 5 to 6 questions that a doctor has pushed to patients with asthma. Mix the input types: sliders, radio buttons, multiple choice, and one free-text question.
- **Example questions** (adjust as needed): breathlessness this week (slider 0 to 10), rescue inhaler uses today (number or radio buttons), night-time waking (radio buttons: yes or no), daily controller medication taken (yes or no), triggers noticed (multiple choice), and an optional free-text note. The body diagram may also be included, for example chest or throat discomfort.
- **Patients:** a small cohort, around 5 to 8 patients, with entries over several weeks.
- **Patterns to build in on purpose**, so the views have something to show: one patient with a worsening trend, one with missed days (adherence gap), one with a sudden spike (anomaly), and one stable patient.
- **Location:** `data/` folder, for example `data/survey.json` (the questions and types) and `data/responses.json` (patient answers with timestamps).
- Design the data so more surveys can be added later. Do not hard-code asthma into the view code.

## Working conventions

- Keep changes small and runnable. Confirm the app still starts with `npm start` after each change.
- Keep the clinician view focused on glanceable signal. Prefer showing change and anomaly over raw values.
- Use mock data only. Never add real patient data to the repo.
- Update the "Repo contents" and "Status" sections of this file whenever files or progress change.
