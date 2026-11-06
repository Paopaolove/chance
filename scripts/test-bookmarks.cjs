#!/usr/bin/env node
/**
 * Harnais signets privés Moment — sans dépendance
 * ajoutée : transpile .ts/.tsx à la volée avec `typescript` (devDependency
 * existante). Les modules npm (react, react-native, expo…) sont remplacés par
 * un stub inerte : seuls le reducer et les helpers purs sont testés.
 * Usage : npm run test:bookmarks   (Node 22)
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

// Stub universel pour les imports npm.
let S;
const anyProto = new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : S) });
S = new Proxy(function () {}, {
  get: (_t, p) => (p === '__esModule' ? false : p === 'then' ? undefined : S),
  apply: () => S,
  construct: () => S,
  getPrototypeOf: () => anyProto,
});

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '__rules_stub__') return request;
  const fromRepo = parent && parent.filename && parent.filename.startsWith(ROOT) && !parent.filename.includes('node_modules');
  if (fromRepo && !request.startsWith('.') && !path.isAbsolute(request) && !request.startsWith('node:')) {
    return '__rules_stub__';
  }
  return origResolve.call(this, request, parent, ...rest);
};
require.cache['__rules_stub__'] = { id: '__rules_stub__', filename: '__rules_stub__', loaded: true, exports: S };

function compile(module, filename) {
  let src = fs.readFileSync(filename, 'utf8');
  if (/ChanceContext\.tsx$/.test(filename)) {
    src += '\nexport { reducer as __reducer, initialState as __initial };';
  }
  const out = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: false,
    },
  }).outputText;
  module._compile(out, filename);
}
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

const assert = require('node:assert/strict');
const { __reducer: reducer, __initial: initial } = require('../src/data/ChanceContext.tsx');
const { bookmarkedOutings } = require('../src/utils/bookmarks.ts');
const { mockHosts, mockOutings } = require('../src/data/mockOutings.ts');
let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass++; }
  catch (error) { fail++; console.error(`FAIL ${name}`, error); }
}
const now = Date.parse('2026-11-06T22:00:00Z');
const outing = { ...mockOutings[0], id: 'saved', status: 'open', spotsLeft: 1,
  startsAt: new Date(now + 60_000).toISOString() };
const user = mockHosts[0];
const base = { ...initial, currentUser: user, outings: [outing] };
const toggle = (state, outingId = outing.id) => reducer(state, {
  type: 'TOGGLE_BOOKMARK', payload: { outingId },
});
const saved = toggle(base);
const withOuting = (patch) => ({ ...saved, outings: [{ ...outing, ...patch }] });
test('ajouter un signet', () => assert.deepEqual(saved.bookmarksByUser[user.id], [outing.id]));
test('retirer le signet', () => assert.deepEqual(toggle(saved).bookmarksByUser[user.id], []));
test('état précédent intact', () => assert.deepEqual(base.bookmarksByUser, {}));
test('aucune demande, place, notif, caution ou autre état modifié', () => {
  const { bookmarksByUser: before, ...original } = base;
  const { bookmarksByUser: after, ...actual } = saved;
  assert.deepEqual(actual, original);
  for (const key of Object.keys(original)) assert.strictEqual(actual[key], original[key]);
});
test('visiteur sans compte inerte', () => {
  const guest = { ...base, currentUser: null };
  assert.strictEqual(toggle(guest), guest);
});
test('moment inconnu inerte', () => assert.strictEqual(toggle(base, 'missing'), base));
test('ancien état sans signets compatible', () => {
  const { bookmarksByUser, ...legacy } = base;
  assert.deepEqual(toggle(legacy).bookmarksByUser[user.id], [outing.id]);
});
test('moment ouvert à venir affiché', () => assert.deepEqual(bookmarkedOutings(saved, now), [outing]));
test('full caché même avec spotsLeft positif', () => assert.deepEqual(bookmarkedOutings(withOuting({ status: 'full' }), now), []));
test('zéro place caché', () => assert.deepEqual(bookmarkedOutings(withOuting({ spotsLeft: 0 }), now), []));
test('places négatives cachées', () => assert.deepEqual(bookmarkedOutings(withOuting({ spotsLeft: -1 }), now), []));
test('début dépassé caché', () => assert.deepEqual(bookmarkedOutings(saved, now + 60_001), []));
test('urgent dépassé caché malgré la fenêtre du fil', () => assert.deepEqual(bookmarkedOutings(withOuting({
  urgentOnSite: true, startsAt: new Date(now - 1).toISOString(),
}), now), []));
test('completed caché même avant le début', () => assert.deepEqual(bookmarkedOutings(withOuting({ status: 'completed' }), now), []));
test('annulé et fermé cachés', () => {
  for (const status of ['cancelled', 'closed']) assert.deepEqual(bookmarkedOutings(withOuting({ status }), now), []);
});
test('le filtre ne supprime pas le signet ; réouverture le restaure', () => {
  const full = withOuting({ status: 'full', spotsLeft: 0 });
  assert.deepEqual(bookmarkedOutings(full, now), []);
  assert.deepEqual(full.bookmarksByUser[user.id], [outing.id]);
  assert.deepEqual(bookmarkedOutings({ ...full, outings: [outing] }, now), [outing]);
});
test('autre utilisateur : aucun signet du premier', () => {
  assert.deepEqual(bookmarkedOutings({ ...saved, currentUser: mockHosts[1] }, now), []);
});
test('signets conservés indépendamment pour chaque utilisateur', () => {
  const other = toggle({ ...saved, currentUser: mockHosts[1] });
  const removed = toggle(other);
  assert.deepEqual(removed.bookmarksByUser[mockHosts[1].id], []);
  assert.deepEqual(bookmarkedOutings({ ...removed, currentUser: user }, now), [outing]);
});
test('signet conservé après une autre action démo', () => {
  assert.deepEqual(bookmarkedOutings(reducer(saved, { type: 'SEE_SLIDES' }), now), [outing]);
});
test('signets sérialisables dans l’état démo', () => {
  assert.deepEqual(bookmarkedOutings(JSON.parse(JSON.stringify(saved)), now), [outing]);
});
test('visiteur ne voit aucune liste', () => assert.deepEqual(bookmarkedOutings({ ...saved, currentUser: null }, now), []));
console.log({ pass, fail });
if (fail) process.exitCode = 1;
