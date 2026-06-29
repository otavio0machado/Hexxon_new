import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8771;
const URL = `http://localhost:${PORT}/index.html`;
const SHOT = '/tmp/hexxon_shots';
mkdirSync(SHOT, { recursive: true });

// ---- build, then start the dev server in STUB mode ----
execSync('python3 build.py', { cwd: ROOT, stdio: 'ignore' });
const server = spawn('node', ['dev-server.mjs'], { cwd: ROOT, env: { ...process.env, STUB: '1', PORT: String(PORT) } });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server start timeout')), 8000);
  server.stdout.on('data', (d) => { if (/dev-server on/.test(String(d))) { clearTimeout(t); resolve(); } });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
});

const consoleErrors = [], pageErrors = [], failedReq = [];
const results = [];
const ok = (name, cond, extra = '') => results.push([cond ? 'PASS' : 'FAIL', name, extra]);
let browser;

try {
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.startsWith('data:') && !/favicon/.test(u)) failedReq.push(u + ' :: ' + (r.failure()?.errorText || '')); });

  const txt = () => page.evaluate(() => document.body.innerText);
  const inc = (t, s) => t.toLowerCase().includes(s.toLowerCase());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickByText = (needle, { last = false } = {}) => page.evaluate(({ needle, last }) => {
    const n = needle.toLowerCase();
    let els = [...document.querySelectorAll('#app *')].filter((e) => !/^(script|style)$/i.test(e.tagName) && (e.innerText || e.textContent || '').toLowerCase().includes(n));
    els = els.filter((e) => ![...e.children].some((c) => (c.innerText || c.textContent || '').toLowerCase().includes(n)));
    const el = last ? els[els.length - 1] : els[0];
    if (!el) return false; el.click(); return true;
  }, { needle, last });

  // clear any prior persisted state, then reload clean
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /Suas disciplinas/.test(document.body.innerText), { timeout: 15000 });
  await sleep(400);
  await page.screenshot({ path: `${SHOT}/r01-empty.png` });

  let t = await txt();
  ok('empty: hero heading', inc(t, 'Suas disciplinas'));
  ok('empty: no demo data', !inc(t, 'Matemática Discreta') && !inc(t, 'Ana Moreira'));
  ok('empty: identity = Estudante', inc(t, 'Estudante'));
  ok('empty: footer 0/0/0', inc(t, '0 disciplinas · 0 aulas · 0 nós'));
  ok('empty: "Nova disciplina" slot', inc(t, 'Nova disciplina'));

  // ---- create a discipline ----
  ok('action: click "Nova disciplina"', await clickByText('Nova disciplina'));
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="Estruturas"]'), { timeout: 5000 });
  await page.type('input[placeholder*="Estruturas"]', 'Lógica de Teste');
  ok('action: "Criar quadro"', await clickByText('Criar quadro'));
  await page.waitForFunction(() => /Lógica de Teste/.test(document.body.innerText) && /\d+%/.test(document.body.innerText), { timeout: 8000 });
  await sleep(500);
  await page.screenshot({ path: `${SHOT}/r02-new-canvas.png` });
  t = await txt();
  ok('canvas: title node shows discipline', inc(t, 'Lógica de Teste') && inc(t, 'Disciplina'));
  ok('canvas: hint panel', inc(t, 'Como funciona'));

  // ---- create an empty node + generate via stubbed AI ----
  await page.mouse.click(360, 700, { clickCount: 2, delay: 50 });
  await sleep(300);
  ok('canvas: empty node created', inc(await txt(), 'Nó vazio'));
  ok('action: node "Invocar IA"', await clickByText('Invocar IA'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="bloco de questões"]'), { timeout: 5000 });
  await page.focus('textarea[placeholder*="bloco de questões"]');
  await page.keyboard.type('logica de teste');
  await page.keyboard.press('Enter');
  // generation: stub waits 500ms (reading phase), then frontend types the result
  await page.waitForFunction(() => /Bloco de Teste/.test(document.body.innerText), { timeout: 10000 });
  await sleep(2500);
  await page.screenshot({ path: `${SHOT}/r03-generated.png` });
  t = await txt();
  ok('gen: node filled "Bloco de Teste"', inc(t, 'Bloco de Teste'));
  ok('gen: prompt reached the API (echoed in Q1)', inc(t, 'Questão de teste 1 — logica de teste'));
  ok('gen: kicker "Gerado · 3 questões"', inc(t, 'Gerado · 3 questões') || inc(t, 'regenerar'));

  // ---- reading modal ----
  ok('action: "abrir leitura"', await clickByText('abrir leitura'));
  await page.waitForFunction(() => /resolvidas/.test(document.body.innerText), { timeout: 5000 });
  await sleep(300);
  await page.screenshot({ path: `${SHOT}/r04-reading.png` });
  t = await txt();
  ok('reading: title = block title', inc(t, 'Bloco de Teste'));
  ok('reading: 0 / 3 resolvidas', /0 \/ 3 resolvidas/.test(t));
  ok('reading: shows generated questions', inc(t, 'Questão de teste 2 sobre tabelas-verdade'));
  ok('action: "ver resolução"', await clickByText('ver resolução'));
  await sleep(250);
  ok('reading: reveals solution', inc(await txt(), 'Passo 1 da resolução'));
  ok('action: "marcar resolvida"', await clickByText('marcar resolvida'));
  await sleep(250);
  ok('reading: progress 1 / 3', /1 \/ 3 resolvidas/.test(await txt()));
  await page.screenshot({ path: `${SHOT}/r05-reading-solved.png` });
  ok('action: "Concluir"', await clickByText('Concluir'));
  await sleep(700); // let debounced persist flush

  // ---- persistence across reload ----
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => /Suas disciplinas/.test(document.body.innerText), { timeout: 10000 });
  await sleep(400);
  t = await txt();
  ok('persist: discipline survived reload', inc(t, 'Lógica de Teste'));
  ok('persist: footer counts updated', inc(t, '1 disciplinas') || inc(t, '1 nós'));
  ok('action: reopen discipline', await clickByText('Lógica de Teste'));
  await page.waitForFunction(() => /Bloco de Teste|Nó vazio/.test(document.body.innerText), { timeout: 6000 });
  await sleep(500);
  ok('persist: generated node survived', inc(await txt(), 'Bloco de Teste'));
  await page.screenshot({ path: `${SHOT}/r06-after-reload.png` });

  // ---- account screen + accent ----
  await page.click('button[title="Conta"]');
  await page.waitForFunction(() => /Estudante/.test(document.body.innerText) && /acento/i.test(document.body.innerText), { timeout: 5000 });
  await sleep(300);
  await page.screenshot({ path: `${SHOT}/r07-conta.png` });
  t = await txt();
  ok('conta: identity Estudante', inc(t, 'Estudante'));
  ok('conta: prefs present', inc(t, 'Cor de acento') && inc(t, 'Grid pontilhado'));
  const stats = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#app div').forEach((d) => {
      const label = (d.textContent || '').trim();
      if (['Disciplinas', 'Nós', 'Gerações'].includes(label) && d.previousElementSibling) {
        out[label] = (d.previousElementSibling.textContent || '').trim();
      }
    });
    return out;
  });
  ok('conta: stat Disciplinas = 1', stats['Disciplinas'] === '1', JSON.stringify(stats));
  ok('conta: stat Gerações = 1', stats['Gerações'] === '1', JSON.stringify(stats));
  const picked = await page.evaluate(() => { const b = [...document.querySelectorAll('button[title]')].find((x) => x.title === 'Verde-folha'); if (!b) return false; b.click(); return true; });
  await sleep(300);
  const ox = (await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => getComputedStyle(e).getPropertyValue('--ox').trim()); return el ? getComputedStyle(el).getPropertyValue('--ox').trim() : ''; })).toLowerCase();
  ok('conta: accent updates --ox', picked && ox === '#2e3a2c', `--ox=${ox}`);

  // ---- reset all ----
  ok('action: "Apagar tudo"', await clickByText('Apagar tudo'));
  await page.waitForFunction(() => /0 disciplinas · 0 aulas · 0 nós/.test(document.body.innerText), { timeout: 5000 });
  ok('reset: back to empty', inc(await txt(), '0 disciplinas · 0 aulas · 0 nós'));
  const cleared = await page.evaluate(() => localStorage.getItem('sandbox-de-nos:v1'));
  ok('reset: localStorage cleared', cleared === null);
  await page.screenshot({ path: `${SHOT}/r08-reset.png` });

} catch (e) {
  results.push(['FAIL', 'EXCEPTION', String((e && e.stack) || e)]);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}

console.log('\n================ ASSERTIONS ================');
let pass = 0, fail = 0;
for (const [s, n, x] of results) { console.log(`${s}  ${n}${x ? '  (' + x + ')' : ''}`); s === 'PASS' ? pass++ : fail++; }
console.log(`\n${pass} passed, ${fail} failed`);
console.log('console errors:', consoleErrors.length ? '\n' + consoleErrors.join('\n') : '(none)');
console.log('uncaught page errors:', pageErrors.length ? '\n' + pageErrors.join('\n') : '(none)');
console.log('failed requests:', failedReq.length ? '\n' + failedReq.join('\n') : '(none)');
console.log('screenshots in', SHOT);
process.exit(fail > 0 || pageErrors.length > 0 ? 1 : 0);
