# Foundation contract

All data is mock. Use survey metadata for question labels, types, options, ranges, and body regions; do not branch on a condition name.

## Widget registry

```js
window.Widgets.register({
  id: 'my-widget',                 // unique string
  title: 'My widget',              // display label
  sizes: ['S', 'M', 'L'],          // nonempty supported subset
  render(el, ctx) {
    const { data, patientId, size, onChange } = ctx;
    // el is this instance's attached .widget-body DOM element.
    // Render with plain DOM APIs. Return an optional cleanup function.
  },
});
window.Widgets.list();            // definitions in registration order, new array
window.Widgets.get('my-widget');  // definition, or undefined
```

`ctx` has exactly `{ data, patientId, size, config, onChange }`. `config` is this instance's persisted JSON object (a copy in the enlarged modal). Clicking a card re-renders the widget at size L inside a modal, where `onChange` does nothing. `data` is the resolved getData() result below. `size` is S, M, or L. `onChange()` requests a save; `onChange(jsonObject)` optionally replaces this instance's persisted `config`. It does not rerender. The foundation has no config editor; widgets can retrieve persisted config through getPrefs() using `el.closest('.widget-card').dataset.instanceId`. Keep the callback scoped to its render lifecycle.

The canvas rerenders on patient changes, reorder, resize, add/remove, and late registration. Release timers and external listeners with the optional returned cleanup function. No async render contract. Registration rejects duplicates and invalid definitions; metadata is frozen. Multiple instances of a widget are supported. A missing widget keeps its saved place and can be removed.

Load registry.js, then your local widget script, then canvas.js and renderer.js. A late registration also refreshes the tray. Add no other properties to window.api. Use only CSS variables for colors in styles.css.

The grid stores order, not pixel coordinates. S/M/L span 2/3/6 columns on a six-column desktop grid; narrower windows adapt. Drop onto a card to insert before it; drop onto empty grid or the trailing drop area to append. Arrow buttons provide keyboard-accessible reordering.

## Preload bridge

```js
await window.api.getData();       // { survey, schemaVersion, mock, period, patients, entries }
await window.api.getPrefs();      // full preferences document below
await window.api.savePrefs(layout); // validates/saves active clinician layout; returns full prefs
```

These are the only exposed bridge functions. Each invokes a same-named ipcMain.handle channel. Only the app's main frame may invoke them. contextIsolation and sandbox are true, nodeIntegration is false, and CSP is `default-src 'self'`.

`getData()` joins data/survey.json and data/responses.json:

- `survey`: `{ id, title, condition, schedule, questions, bodyDiagram, ... }`; six questions keyed by stable ids. Radio values are booleans, multiple choice is an array of option ids, optional text can be absent.
- `period`: `{ start, end, expectedDays: 42 }`; dates are inclusive, 2026-09-21 through 2026-11-01.
- `patients[]`: `{ id, name, surveyIds, demoPattern, baseline }`.
- `baseline`: `{ surveyId, start, end, method, stats }`. `stats[questionId]` contains `{ n, mean, stdDev, bandLow, bandHigh }` for numeric/boolean questions. It uses the first 14 days, population SD, and mean ± 2 SD clamped to the question's range. A boolean mean is the proportion true. These are demo reference bands, not clinical thresholds.
- `entries[]`: `{ id, patientId, surveyId, date, timestamp, answers, bodyReports }`. Filter by patientId and surveyId, sort by date. `date` is the reporting day, `timestamp` has an explicit offset. Missing days are absent entries, not zero scores or proof that medication was missed.
- `bodyReports[]`: `{ region, timestamp, intensity }`, intensity 0–10. Region ids: `nose_sinus`, `throat`, `chest`, `lung_left`, `lung_right`; labels come from survey.bodyDiagram.regions.

Planted scenarios: patient-001 worsening; patient-002 seven missing reporting days plus explicit controller misses; patient-003 one sudden spike; patient-004 stable; patient-005 improving; patient-006 variable. `demoPattern` is fixture metadata, not a computed clinical assessment.

## Preferences

```js
{
  schemaVersion: 1,
  activeClinicianId: 'clinician-demo',
  clinicians: {
    'clinician-demo': {
      name: 'Demo clinician',
      layout: {
        patientId: 'patient-001',
        widgets: [
          { instanceId: 'hello-1', widgetId: 'hello', size: 'M', config: {} }
        ]
      }
    }
  }
}
```

Pass only `layout` to savePrefs. Array order is visual order. instanceId is unique per card; widgetId refers to a registered definition. Empty arrays are valid. Up to 100 cards and 100 KB of serialized layout are accepted. Saves are serialized and atomically replace the writable JSON; the UI reports save errors and offers Retry save.

data/preferences.json is copied only if the writable file does not exist, to `path.join(app.getPath('userData'), 'preferences.json')`. On Windows the default location is `%APPDATA%/smart-home-clinician-view/preferences.json`. Editing the bundled defaults does not replace an existing clinician layout.

Implementation follows Electron's [two-way IPC documentation](https://www.electronjs.org/docs/latest/tutorial/ipc) and [security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
