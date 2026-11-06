# SMART@Home Clinician Data-View — Design Doc

## What we know

### The platform
- SMART@Home (Self-Management Assistance for Recommended Treatment at Home) is a digital health platform built at Cincinnati Children's.
- It helps patients manage chronic and complex conditions at home (e.g. asthma, IBD, migraine) in one unified app.
- Patient data flows into the Epic EHR.
- It is built on 20+ years of adherence research (positive reinforcement, gamification, reminders).
- Trackers and care logic are co-designed by the patients and clinicians who use them.
- Clinicians configure condition-specific trackers in a no-code interface. New trackers deploy in minutes and update from patient feedback.

### The problem
- SMART@Home now collects rich patient data.
- On the clinician side, that data arrives as raw rows in a table.
- That table is not practical to use during a visit.

Situations where the current view falls short:
- Time is short, and the clinician needs the "what changed and what matters now" view immediately.
- Different specialists need different levels of detail from the same patient data.
- The team needs to compare a patient's status and responses over time, which is hard today.

### Scope
- The challenge is to design the clinician data view only. It is not a redesign of the whole platform.
- Starting point: the existing tabs (Patients, Trackers, Studies) and per-patient logs.
- Deliverable: a wireframe of the clinician data view, informed by interviews with clinicians provided by the organizers.

### Open questions raised in the brief
- What does a clinician need to see in the first 30 seconds of opening a patient's record?
- Which data points drive treatment decisions, and which are noise?
- How do needs differ across specialties viewing the same data?
- How should the view support verifying adherence, spotting trends, flagging anomalies, and guiding treatment?

### Context
- Digital Health Hackathon 2026, Innovation Ventures, Cincinnati Children's Hospital Medical Center.
- Principal Investigators: Kevin Hommel, Matt Wortman, Rachel Ramsey.

### Tracker 
- Doctors make apps with drag and drop.
- Build trackers for patient groups, not only individuals.

## App Design Choices

#### Look and feel 
- Heavy UI inspiration from the How We Feel app.
- UI built in Electron.js (voice interface considered and dropped).
- Reactive and constantly moving: the view updates live and feels alive, not static.
- Make a mascot.

#### Clinician view
- Drag-and-drop visuals and setup: clinicians arrange which charts and cards they see.
- Pre-flight + regular views: a quick pre-visit summary, plus a full view for deeper review.
- Post-game interview: a structured debrief after the visit, connecting patient and provider (P ↔ P).

#### Intelligence
- Generalized ML model for anomaly detection and prediction, works across trackers.
- "Calibrate": the model adjusts to each patient's own baseline.

#### Patient-side inputs (outside scope)
-Question types: multiple choice, radio buttons, sliders, text entry.
Interactive body diagram: "touch and point to where it hurts."


## Color palette

- #772152
- #0091b7
- #619a3c
- #244946

## Repo contents

```
CLAUDE.md            project context (this file)
README.md            stub, title only
package.json         scripts: `npm start` -> `electron .`; entry `src/main.js`
package-lock.json
.gitignore           node_modules/, dist/, out/
src/
  main.js            main process: 1280x800 BrowserWindow, loads renderer/index.html
  preload.js         contextBridge exposes `window.api.versions`
  renderer/
    index.html       page shell, CSP `default-src 'self'`, header + `#app` mount
    styles.css       CSS vars for the four palette colors, basic header/main styling
    renderer.js      placeholder: prints Electron/Chrome versions into `#app`
```

## Tech stack

- Electron (dev dependency), plain JS, no bundler, no framework, no tests yet.
- Security: `contextIsolation: true`, `nodeIntegration: false`, CSP in `index.html`.
- Status: bare scaffold. No clinician data view built yet. No data source or mock data yet.
