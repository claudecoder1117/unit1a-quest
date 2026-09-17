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

import { mountSettings } from './settings.js';   // T15

import { mountHome } from './home.js';

import { mountBinder } from './binder.js';       // T11
import { mountStats } from './stats.js';         // T11
import { bus } from '../app.js';                 // T11 (live binding — read inside the microtask below)
import { getState, update } from '../store.js';  // T11
import { install as installTrophies } from '../trophies.js';   // T11

import { mountCard, mountVariant } from './card.js';   // T09
import { mountOnboard } from './onboard.js';     // T14
import { mountSheet } from './sheet.js';         // T14
import { mountRun } from './run.js';             // T16
import { mountBoss } from './boss.js';           // T12
import { mountMock } from './mock.js';           // T13
import { mountReport } from './report.js';       // T13
import * as sound from '../sound.js';            // W3 integration: T15's synth, subscribed to the bus below

export const screens = {};
screens['/card/:id'] = mountCard; screens['/variant/:template'] = mountVariant;   // T09
screens['/today'] = mountHome;   // T10
screens['/run/:kind/:id?'] = mountRun;           // T16
screens['/boss/:id'] = mountBoss;                // T12
screens['/mock'] = mountMock;                    // T13
screens['/mock/report/:n'] = mountReport;        // T13

screens['/settings'] = mountSettings;            // T15
screens['/onboard'] = mountOnboard;              // T14
screens['/sheet'] = mountSheet;                  // T14
// T16: run.js has taken this pattern over (notes/T14.md: "when T16's run.js lands"). It delegates
// night · morning · post back to night.js's mountRunKind and jump to onboard.js's mountJump, so those
// four screens are still T14's — there is just one registration and one mount point (S1, 13 routes).
screens['/binder'] = mountBinder;                // T11
screens['/stats'] = mountStats;                  // T11

// T11: trophies are pure predicates over the save, evaluated after every grade (S4) — `install` listens
// on bus 'graded' and on 'state'. Deferred one microtask because THIS module is imported from app.js's
// own module body, so `bus` is still in its temporal dead zone right here; by the microtask app.js has
// finished evaluating. Nothing else in the app has to remember to call it.
queueMicrotask(() => {
  try { installTrophies({ bus, getState, update }); } catch (e) { console.error('trophies.install', e); }

  // Wave 3 integration (notes/T15.md "Requests"): nothing called js/sound.js. The Card screen already
  // emits the cues; wiring them here keeps the screens ignorant of audio and gives every future screen
  // the same hookup for free. play() is a no-op when sound is off, after 22:00, or without WebAudio.
  try {
    bus.on('sfx', (cue) => {
      if (cue === 'levelup') sound.play('level');
      else if (cue === 'correct' || cue === 'wrong') sound.play(cue);
      // 'almost' is deliberately silent: Global rule 2 says an almost costs nothing, so it should not
      // sound like a miss, and a second "correct" chirp on a near-answer would read as a clear.
    });
    // The combo chime rides on top of the correct cue once the combo is actually worth something (amber, ≥ 5).
    bus.on('card:cleared', (r) => { if (r && r.comboAfter >= 5 && r.comboAfter > r.comboBefore) sound.combo(r.comboAfter); });
  } catch (e) { console.error('sound.wire', e); }
});
