#!/usr/bin/env node
/**
 * npm run verify — vérification complète avant un push (outillage seulement).
 *
 * Étapes, dans l'ordre, arrêt au premier échec :
 *   1. tsc --noEmit
 *   2. npm run test:rules
 *   3. export web (expo export --platform web → .verify/dist)
 *   4. captures Playwright fixes de l'export (.verify/captures, 390×844)
 *
 * Sortie : UNE ligne finale
 *   verify OK · tsc 0 · 722/722 tests · export OK · 6 captures · 42 s
 *   verify KO · <étape> · <premier échec>
 * Détails : .verify/verify.log (ignoré par git, comme tout .verify/).
 *
 * Node 22 : $HOME/.local/node22/bin est mis en tête du PATH des sous-processus.
 * Navigateur : playwright-core (devDependency, sans téléchargement de navigateur)
 * pilote le Chrome déjà installé sur la machine ; VERIFY_CHROME pour en forcer un.
 * Les captures ne sont jamais comparées au pixel : on vérifie seulement qu'elles
 * existent, qu'elles ne sont pas vides et que l'écran attendu est affiché.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.verify');
const DIST = path.join(OUT, 'dist');
const SHOTS = path.join(OUT, 'captures');
const LOG = path.join(OUT, 'verify.log');
const VIEWPORT = { width: 390, height: 844 };
const MIN_PNG_BYTES = 5000;
const t0 = Date.now();

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(LOG, `verify ${new Date().toISOString()}\n`);
const log = (s) => fs.appendFileSync(LOG, s.endsWith('\n') ? s : s + '\n');

const node22 = path.join(os.homedir(), '.local', 'node22', 'bin');
const env = {
  ...process.env,
  PATH: fs.existsSync(node22) ? `${node22}${path.delimiter}${process.env.PATH}` : process.env.PATH,
  CI: '1',
  // Export local : aucun appel aux services Expo (pas de compte, pas de jeton).
  EXPO_OFFLINE: '1',
  EXPO_NO_TELEMETRY: '1',
};

function run(label, cmd, args) {
  log(`\n=== ${label} : ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  log(out);
  log(`--- ${label} : code ${r.status}${r.error ? ` (${r.error.message})` : ''}`);
  return { code: r.error ? 1 : r.status, out };
}

function finish(ok, parts) {
  const secs = Math.round((Date.now() - t0) / 1000);
  const line = ok ? `verify OK · ${parts.join(' · ')} · ${secs} s` : `verify KO · ${parts.join(' · ')}`;
  log(`\n${line}`);
  console.log(line);
  process.exit(ok ? 0 : 1);
}

const firstLine = (s, re) => {
  const l = s.split('\n').find((x) => re.test(x));
  return (l ?? '').trim().slice(0, 200);
};

async function main() {
  const done = [];

  // 1. tsc
  const tsc = run('tsc', 'npx', ['tsc', '--noEmit']);
  const tscErrors = (tsc.out.match(/error TS\d+/g) ?? []).length;
  if (tsc.code !== 0 || tscErrors) {
    finish(false, ['tsc', firstLine(tsc.out, /error TS\d+/) || `code ${tsc.code}`]);
  }
  done.push('tsc 0');

  // 2. tests de règles
  const tests = run('test:rules', 'npm', ['run', '--silent', 'test:rules']);
  const m = tests.out.match(/\{\s*pass:\s*(\d+),\s*fail:\s*(\d+)\s*\}/);
  if (!m) finish(false, ['tests', firstLine(tests.out, /Error|error/) || 'compteur introuvable']);
  const pass = Number(m[1]);
  const fail = Number(m[2]);
  if (tests.code !== 0 || fail > 0) {
    finish(false, ['tests', `${fail} échec(s) · ${firstLine(tests.out, /^FAIL /) || `code ${tests.code}`}`]);
  }
  done.push(`${pass}/${pass + fail} tests`);

  // 3. export web
  fs.rmSync(DIST, { recursive: true, force: true });
  const exp = run('export web', 'npx', ['expo', 'export', '--platform', 'web', '--output-dir', path.relative(ROOT, DIST)]);
  if (exp.code !== 0 || !fs.existsSync(path.join(DIST, 'index.html'))) {
    finish(false, ['export', firstLine(exp.out, /Error|error|Unable/) || `code ${exp.code}`]);
  }
  done.push('export OK');

  // 4. captures
  try {
    const n = await captures();
    done.push(`${n} captures`);
  } catch (e) {
    log(String(e && e.stack ? e.stack : e));
    finish(false, ['captures', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 200)]);
  }
  finish(true, done);
}

function findChrome() {
  const candidates = [
    process.env.VERIFY_CHROME,
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/ungoogled-chromium/chrome',
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('aucun Chrome trouvé (VERIFY_CHROME pour indiquer le chemin)');
  return hit;
}

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let f = path.join(dir, decodeURIComponent((req.url || '/').split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
      res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function captures() {
  const { chromium } = require('playwright-core');
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(DIST);
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const chrome = findChrome();
  log(`\n=== captures : ${chrome} · ${VIEWPORT.width}×${VIEWPORT.height} · ${url}`);
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  let count = 0;
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
    page.on('console', (msg) => msg.type() === 'error' && log(`[console.error] ${msg.text()}`));
    const text = (t) => page.getByText(t, { exact: true }).first();
    const tab = (t) => page.getByRole('tab', { name: t }).or(page.getByText(t, { exact: true })).last();

    const shot = async (name, expected) => {
      await expected.waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      const file = path.join(SHOTS, `${name}.png`);
      await page.screenshot({ path: file });
      const size = fs.statSync(file).size;
      const bodyText = (await page.innerText('body')).trim();
      log(`[capture] ${name}.png · ${size} o · ${bodyText.length} caractères visibles`);
      if (size < MIN_PNG_BYTES) throw new Error(`${name}.png vide (${size} o)`);
      if (bodyText.length < 20) throw new Error(`${name}.png : écran sans texte`);
      count++;
    };

    await page.goto(url);
    // 01 · Onboarding, premier slide
    await shot('01-onboarding', text('Suivant'));
    // Le bouton « Suivant » s'appuie sur scrollToIndex, inopérant sur le web :
    // on fait défiler la liste horizontale jusqu'au dernier slide.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(
        (d) => d.scrollWidth > d.clientWidth + 10 && /auto|scroll/.test(getComputedStyle(d).overflowX),
      );
      if (!el) throw new Error('liste des slides introuvable');
      el.scrollLeft = el.scrollWidth;
      el.dispatchEvent(new Event('scroll'));
    });
    await text('Commencer').click();
    // 02 · Fil, mode Annonces
    await shot('02-fil-annonces', text('Annonces'));
    // 03 · Fil, mode Dispo
    await text('Dispo').click();
    await shot('03-fil-dispo', text('Dispo'));
    // 04 · Demandes
    await tab('Demandes').click();
    await shot('04-demandes', tab('Demandes'));
    // 05 · Profil
    await tab('Profil').click();
    await shot('05-profil', tab('Profil'));
    // 06 · Publier sans compte → tunnel de compte
    await tab('Publier').click();
    await shot('06-publier-compte', page.getByLabel(/Étape \d+ sur \d+/).first());
  } finally {
    await browser.close();
    srv.close();
  }
  return count;
}

main().catch((e) => {
  log(String(e && e.stack ? e.stack : e));
  finish(false, ['verify', String(e && e.message ? e.message : e).slice(0, 200)]);
});
