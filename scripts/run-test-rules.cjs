#!/usr/bin/env node
/**
 * Harnais règles Moment (joker, départ, caution, H+30…) — sans dépendance
 * ajoutée : transpile .ts/.tsx à la volée avec `typescript` (devDependency
 * existante). Les modules npm (react, react-native, expo…) sont remplacés par
 * un stub inerte : seuls le reducer et les helpers purs sont testés.
 * Usage : npm run test:rules   (Node 22)
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

require(path.join(__dirname, 'test-rules.ts'));
