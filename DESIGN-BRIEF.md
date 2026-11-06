# Design brief: How We Feel look, applied to the clinician view

Source: howwefeel.org (observed). Nonprofit app by Yale Center for Emotional Intelligence + Pinterest co-founder's team.

## What the reference does
- Pure black ground, white serif display type ("A journal for your wellbeing"), tiny sans nav.
- Mascots: small flat-colour characters (yellow half-disc, green heart-blob, blue cross-blob, red book-shape) with thin white line-art legs/arms and tiny hearts. Each has a distinct shape + colour = each has a distinct mood.
- Outline pill buttons with arrow ("Download the app ->").
- Three-beat copy: check in, spot patterns over time, learn what helps now. Maps directly to our clinician flow.

## Apply to SMART@Home
- Palette (from CLAUDE.md): #772152 plum, #0091b7 teal-blue, #619a3c green, #244946 deep teal. The canvas assigns each widget a solid fill from this palette and exposes it as `--widget-palette`. Use white and `color-mix()` tints or shades of that token for chart marks, filled areas and text; do not add new hex colors. The outer application may keep its dark ground.
- Type: serif display for headings (Georgia/Fraunces-like fallback stack), system sans for data.
- Mascot: one blob character whose shape/colour reflects patient status (steady / drifting / needs attention). Idle animation (breathing, blink); reacts when new data arrives.
- Live feel: values tick, sparklines draw in, cards ease in; mock data stream every few seconds.
- Pills for filters/tabs (Patients, Trackers, Studies), outline style.

## Views
1. Pre-flight (30-second summary): what changed since last visit, flags, adherence, mascot status.
2. Full view: draggable cards/charts, timeline comparison, anomaly markers, per-specialty presets.
3. Post-game: structured debrief form after visit.
4. Calibrate: per-patient baseline band on each chart.

## Constraints
- Electron, plain JS, no bundler/framework. Keep CSP `default-src 'self'` (no CDN; vendor any lib locally).
- No real patient data: mock only, clearly labelled.
- Do not copy How We Feel's actual artwork or logo; make original shapes.
