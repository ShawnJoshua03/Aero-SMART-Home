# CCMH-Cintrifuse-Hack

SMART@Home clinician data-view Electron prototype. All patient data is invented.

```sh
npm ci
npm start
npm test
npm run verify:electron
```

Add widgets from the tray, drag them into order, choose S/M/L, and remove them with ×. Arrow controls also reorder cards. The patient selector rerenders every widget. Changes persist in the OS user-data directory, not the source tree.

Widget authors: read [WIDGET-API.md](WIDGET-API.md), [CLAUDE.md](CLAUDE.md), and [DESIGN-BRIEF.md](DESIGN-BRIEF.md). Register your script after registry.js and before canvas startup in index.html.

Verification uses no testing framework or extra dependency. The Electron smoke test uses a temporary profile and two processes to check restart persistence. Its drag coverage dispatches HTML5 DragEvent/DataTransfer events; native pointer dragging still needs a manual check. Desktop automation confirmed launch, Add, S size, and button reordering, but could not trigger a native drop.
