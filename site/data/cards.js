// cards.js — every original Card in one flat array + a byId map (COMPOSED S6 card schema).
// Content is split by sheet so content tickets never edit the same file (BUILD-POLICY §2);
// this index only concatenates. Order here = Binder order of the sheets.
import { cards as m1 } from './cards/m1.js';
import { cards as angles } from './cards/angles.js';
import { cards as doc } from './cards/doc.js';
import { cards as wp } from './cards/wp.js';
import { cards as asn } from './cards/asn.js';
import { cards as fac } from './cards/fac.js';

export const cards = [...m1, ...angles, ...doc, ...wp, ...asn, ...fac];

/** id → card. Duplicate ids are a content bug caught by tests/coverage.test.mjs, never masked here. */
export const byId = Object.fromEntries(cards.map(c => [c.id, c]));

export function getCard(id) { return byId[id] ?? null; }
