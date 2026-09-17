// screens/index.js — the screen registry. app.js imports this and overlays it on its placeholder routes.
// Each screen ticket adds ONE import line and ONE assignment here (BUILD-POLICY §2 allows the one-line wiring):
//   import { mountHome } from './home.js';          screens['/today'] = mountHome;        // T10
//   import { mountBinder } from './binder.js';      screens['/binder'] = mountBinder;     // T11
//   import { mountCard } from './card.js';          screens['/card/:id'] = mountCard;     // T09
//                                                   screens['/variant/:template'] = ...   // T09
//   import { mountRun } from './run.js';            screens['/run/:kind/:id?'] = mountRun; // T16
//   import { mountBoss } from './boss.js';          screens['/boss/:id'] = mountBoss;     // T12
//   import { mountMock } from './mock.js';          screens['/mock'] = mountMock;         // T13
//   import { mountReport } from './report.js';      screens['/mock/report/:n'] = mountReport; // T13
//   import { mountStats } from './stats.js';        screens['/stats'] = mountStats;       // T11
//   import { mountSheet } from './sheet.js';        screens['/sheet'] = mountSheet;       // T14
//   import { mountSettings } from './settings.js';  screens['/settings'] = mountSettings; // T15
//   import { mountOnboard } from './onboard.js';    screens['/onboard'] = mountOnboard;   // T14
// A handler is  (el, params, query) => void | cleanupFn  — see app.js `mount` and notes/T01.md.
// Patterns must be one of the 13 in app.js ROUTES (a typo is reported in the console at boot).

export const screens = {};
