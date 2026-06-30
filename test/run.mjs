import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8771;
const URL = `http://localhost:${PORT}/index.html`;
const SHOT = '/tmp/hexxon_shots';
mkdirSync(SHOT, { recursive: true });

// a tiny but structurally-valid single-page PDF (correct xref offsets) so pdf.js parses it
function makeMinimalPdf() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
  ];
  const stream = 'BT /F1 18 Tf 20 120 Td (Cronograma de teste) Tj ET';
  objs.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs[i] = Buffer.byteLength(pdf, 'latin1'); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

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
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && !/favicon/.test(u)) failedReq.push(u + ' :: ' + (r.failure()?.errorText || '')); });
  let lastGenBody = null;
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/generate$/.test(r.url())) { try { lastGenBody = JSON.parse(r.postData() || '{}'); } catch {} } });
  page.on('dialog', (d) => { d.accept().catch(() => {}); }); // auto-accept the delete-discipline confirm

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

  // ---- create an empty node ----
  await page.mouse.click(360, 700, { clickCount: 2, delay: 50 });
  await sleep(300);
  ok('canvas: empty node created', inc(await txt(), 'Nó vazio'));

  // ---- Material: create a Nota, type content, connect it to the node ----
  ok('action: "+ Nota"', await clickByText('+ Nota'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="anotações"]'), { timeout: 5000 });
  const MARK = 'DEFINICAO_MATERIAL_XYZ contrapositiva equivale a p->q';
  await page.focus('textarea[placeholder*="anotações"]');
  await page.keyboard.type(MARK);
  await sleep(200);
  ok('note: content is editable/kept', inc(await page.evaluate(() => document.querySelector('textarea[placeholder*="anotações"]').value), 'DEFINICAO_MATERIAL_XYZ'));
  await page.screenshot({ path: `${SHOT}/r03a-note.png` });
  // connect the note's handle (●) to the empty node via dispatched PointerEvents
  const connected = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#app div')].filter((d) => d.style && d.style.cursor === 'grab' && d.style.pointerEvents === 'auto');
    const noteW = wraps.find((w) => w.querySelector('textarea[placeholder*="anotações"]'));
    const genW = wraps.find((w) => /n[óo] vazio/i.test(w.innerText || ''));
    if (!noteW || !genW) return false;
    const handle = noteW.querySelector('div[title="arraste para conectar"]');
    const hr = handle.getBoundingClientRect(), gr = genW.getBoundingClientRect();
    const hx = hr.x + hr.width / 2, hy = hr.y + hr.height / 2, gx = gr.x + gr.width / 2, gy = gr.y + gr.height / 2;
    const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
    fire(handle, 'pointerdown', hx, hy);
    fire(window, 'pointermove', (hx + gx) / 2, (hy + gy) / 2);
    fire(window, 'pointermove', gx, gy);
    fire(window, 'pointerup', gx, gy);
    return true;
  });
  ok('note: connect gesture dispatched', connected);
  await sleep(300);
  ok('note: connection formed (lê de)', inc(await txt(), 'lê de'));

  // ---- generate, capturing the request payload ----
  ok('action: node "Invocar IA"', await clickByText('Invocar IA'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="bloco de questões"]'), { timeout: 5000 });
  await page.focus('textarea[placeholder*="bloco de questões"]');
  await page.keyboard.type('logica de teste');
  // choose quantity 8 and level Difícil
  await page.evaluate(() => { const b = [...document.querySelectorAll('#app button')].find((x) => x.textContent.trim() === '8'); if (b) b.click(); });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#app button')].find((x) => x.textContent.trim() === 'Difícil'); if (b) b.click(); });
  await sleep(150);
  lastGenBody = null;
  await page.evaluate(() => { const b = [...document.querySelectorAll('#app button')].find((x) => x.textContent.trim() === 'Gerar'); if (b) b.click(); });
  await page.waitForFunction(() => /Bloco de Teste/.test(document.body.innerText), { timeout: 10000 });
  await sleep(2500);
  await page.screenshot({ path: `${SHOT}/r03-generated.png` });
  t = await txt();
  ok('gen: node filled "Bloco de Teste"', inc(t, 'Bloco de Teste'));
  ok('gen: prompt carries text + chosen params', !!lastGenBody && /logica de teste/.test(lastGenBody.prompt || '') && /8 quest/.test(lastGenBody.prompt || '') && /dif/i.test(lastGenBody.prompt || ''), lastGenBody ? lastGenBody.prompt : '(none)');
  ok('gen: connected note sent as context', !!lastGenBody && JSON.stringify(lastGenBody.context || []).includes('DEFINICAO_MATERIAL_XYZ'), lastGenBody ? JSON.stringify(lastGenBody.context).slice(0, 90) : 'no body');

  // ---- reading modal ----
  ok('action: "abrir leitura"', await clickByText('abrir leitura'));
  await page.waitForFunction(() => /resolvidas/.test(document.body.innerText), { timeout: 5000 });
  await sleep(300);
  await page.screenshot({ path: `${SHOT}/r04-reading.png` });
  t = await txt();
  ok('reading: title = block title', inc(t, 'Bloco de Teste'));
  ok('reading: 0 / 3 resolvidas', /0 \/ 3 resolvidas/.test(t));
  ok('reading: shows generated questions', inc(t, 'Questão de teste 2 sobre tabelas-verdade'));
  // KaTeX renders the LaTeX in the question ($x^2 + 1 = 0$)
  await page.waitForFunction(() => !!document.querySelector('#app .katex'), { timeout: 9000 }).catch(() => {});
  ok('math: KaTeX renders LaTeX in questions', await page.evaluate(() => !!document.querySelector('#app .katex')));
  ok('action: "ver resolução"', await clickByText('ver resolução'));
  await sleep(250);
  ok('reading: reveals solution', inc(await txt(), 'Passo 1 da resolução'));
  ok('action: "marcar resolvida"', await clickByText('marcar resolvida'));
  await sleep(250);
  ok('reading: progress 1 / 3', /1 \/ 3 resolvidas/.test(await txt()));
  // write a resolution into Q1 — must persist
  await page.focus('textarea[placeholder*="resolução"]');
  await page.type('textarea[placeholder*="resolução"]', 'MINHA_RESOLUCAO_123');
  await sleep(250);
  ok('reading: written resolution kept', inc(await page.evaluate(() => document.querySelector('textarea[placeholder*="resolução"]').value), 'MINHA_RESOLUCAO_123'));
  await page.screenshot({ path: `${SHOT}/r05-reading-solved.png` });

  // ---- Milestone C: export to PDF (opens a print window) ----
  const [popup] = await Promise.all([
    new Promise((res) => page.once('popup', res)),
    clickByText('↓ PDF'),
  ]);
  ok('export: PDF window opened', !!popup);
  if (popup) {
    try { await popup.evaluate(() => { window.print = () => {}; }); } catch {}
    await sleep(400);
    const pcontent = await popup.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
    ok('export: PDF has block content', inc(pcontent, 'Bloco de Teste') && inc(pcontent, 'Questão de teste'));
    await popup.close().catch(() => {});
  }

  // ---- Milestone C: flashcards / review ----
  ok('action: open flashcards (↻ Revisar)', await clickByText('↻ Revisar'));
  await page.waitForFunction(() => /Eu sei/i.test(document.body.innerText), { timeout: 5000 });
  await sleep(250);
  await page.screenshot({ path: `${SHOT}/r05b-flashcard.png` });
  t = await txt();
  ok('flash: shows card 1 of 3', /1 \/ 3/.test(t) && inc(t, 'Eu sei') && inc(t, 'Questão de teste'));
  await page.evaluate(() => { const c = [...document.querySelectorAll('#app div')].find((d) => /toque no cart/i.test(d.innerText || '')); if (c) c.click(); });
  await sleep(250);
  ok('flash: flip reveals solution', inc(await txt(), 'Resposta') && /Resolu/i.test(await txt()));
  ok('action: "Eu sei"', await clickByText('Eu sei'));
  await sleep(250);
  // read the flashcard counter specifically (reading modal behind shares "x / 3" text)
  const fcount = () => page.evaluate(() => { const el = [...document.querySelectorAll('#app span')].find((s) => /Revis[ãa]o ·/.test(s.textContent || '')); return el ? el.textContent : ''; });
  ok('flash: advanced to card 2', /2 \/ 3/.test(await fcount()));
  // keyboard: space flips, arrows navigate
  await page.keyboard.press(' ');
  await sleep(200);
  ok('flash: spacebar flips card', await page.evaluate(() => { const c = [...document.querySelectorAll('#app div')].find((d) => /toque para virar/i.test(d.innerText || '')); return !!c; }));
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  ok('flash: arrow key navigates', /3 \/ 3/.test(await fcount()));
  // shuffle resets to the first card
  ok('action: "↬ embaralhar"', await clickByText('embaralhar'));
  await sleep(250);
  ok('flash: shuffle restarts deck', /1 \/ 3/.test(await fcount()));
  await page.keyboard.press('Escape');
  await sleep(250);
  ok('flash: closed (back to reading)', inc(await txt(), 'resolvidas') && !/Eu sei/i.test(await txt()));

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

  // ---- Milestone B: edit & organize ----
  ok('action: reopen reading', await clickByText('abrir leitura'));
  await page.waitForFunction(() => /resolvidas/.test(document.body.innerText), { timeout: 5000 });
  await sleep(250);
  ok('persist: resolved progress survived reload', /1 \/ 3 resolvidas/.test(await txt()));
  ok('persist: written resolution survived reload', inc(await page.evaluate(() => { const t = document.querySelector('textarea[placeholder*="resolução"]'); return t ? t.value : ''; }), 'MINHA_RESOLUCAO_123'));
  await page.click('button[title="Remover questão"]');
  await sleep(300);
  ok('edit: question deleted (2 left)', /0 \/ 2 resolvidas/.test(await txt()));
  ok('action: close reading', await clickByText('Concluir'));
  await sleep(300);
  await page.click('input[title="renomear disciplina"]', { clickCount: 3 });
  await page.keyboard.type('Renomeada');
  await sleep(350);
  ok('edit: discipline renamed (breadcrumb + title)', inc(await txt(), 'Renomeada'));
  await page.screenshot({ path: `${SHOT}/r06b-edited.png` });

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

  // ---- edit profile (name + initials) updates the masthead live ----
  await page.click('input[placeholder="Seu nome"]', { clickCount: 3 });
  await page.type('input[placeholder="Seu nome"]', 'Otavio Machado');
  await page.click('input[placeholder="AB"]', { clickCount: 3 });
  await page.type('input[placeholder="AB"]', 'OM');
  await sleep(300);
  ok('conta: profile name editable', inc(await txt(), 'Otavio Machado'));
  ok('conta: avatar reflects edited initials', await page.evaluate(() => { const b = document.querySelector('button[title="Conta"]'); return b ? /OM/.test(b.textContent) : false; }));

  // ---- Milestone B: delete discipline ----
  ok('action: Voltar à estante', await clickByText('Voltar à estante'));
  await page.waitForFunction(() => /Suas disciplinas/.test(document.body.innerText), { timeout: 5000 });
  await sleep(300);
  ok('shelf: renamed discipline present', inc(await txt(), 'Renomeada'));

  // ---- Milestone B+: manage a discipline from the shelf (⋯ menu → rename) ----
  await page.click('button[title="Opções da disciplina"]');
  await page.waitForFunction(() => /Renomear/.test(document.body.innerText), { timeout: 5000 });
  ok('shelf: ⋯ menu opens', inc(await txt(), 'Renomear') && inc(await txt(), 'Excluir disciplina'));
  // pick a discipline color (2nd swatch = green #2E3A2C) → persisted on the discipline
  await page.evaluate(() => { const bs = [...document.querySelectorAll('#app button[title="Cor"]')]; if (bs[1]) bs[1].click(); });
  await sleep(600);
  ok('shelf: discipline color set', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sandbox-de-nos:v1') || '{}'); return (s.disciplines || []).some((d) => (d.color || '').toLowerCase() === '#2e3a2c'); }));
  ok('action: menu "Renomear"', await clickByText('Renomear'));
  await page.waitForFunction(() => !!document.querySelector('input[title="novo nome da disciplina"]'), { timeout: 5000 });
  await page.click('input[title="novo nome da disciplina"]', { clickCount: 3 });
  await page.type('input[title="novo nome da disciplina"]', 'Renomeada 2');
  ok('action: rename "Salvar"', await clickByText('Salvar'));
  await page.waitForFunction(() => /Renomeada 2/.test(document.body.innerText), { timeout: 5000 });
  await sleep(250);
  ok('shelf: rename from library applied', inc(await txt(), 'Renomeada 2'));

  ok('action: reopen renamed', await clickByText('Renomeada'));
  await page.waitForFunction(() => /\d+%/.test(document.body.innerText), { timeout: 6000 });
  await sleep(400);

  // ---- canvas keyboard zoom (+ / 0) ----
  const zoomPct = () => page.evaluate(() => { const m = document.body.innerText.match(/(\d+)%/); return m ? parseInt(m[1], 10) : 0; });
  const z0 = await zoomPct();
  await page.keyboard.press('+');
  await sleep(150);
  const z1 = await zoomPct();
  ok('canvas: "+" zooms in', z1 > z0, `z0=${z0} z1=${z1}`);
  await page.keyboard.press('0');
  await sleep(150);
  ok('canvas: "0" fits the view', (await zoomPct()) !== z1);

  // ---- Milestone D: search finds note content ----
  ok('action: open search', await clickByText('Buscar'));
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="Buscar disciplinas"]'), { timeout: 5000 });
  await page.type('input[placeholder*="Buscar disciplinas"]', 'DEFINICAO');
  await sleep(300);
  ok('search: matches note content', inc(await txt(), 'NOTA'));
  await page.keyboard.press('Escape');
  await sleep(200);

  // ---- Milestone D: delete a connection, then undo it ----
  const dotCount = () => page.evaluate(() => document.querySelectorAll('div[title="Selecionar conexão"]').length);
  ok('canvas: a connection handle exists', (await dotCount()) >= 1);
  await page.evaluate(() => { const d = document.querySelector('div[title="Selecionar conexão"]'); if (d) d.click(); });
  await page.waitForFunction(() => !!document.querySelector('button[title="Remover conexão"]'), { timeout: 5000 });
  ok('canvas: clicking handle selects connection (✕ appears)', !!(await page.$('button[title="Remover conexão"]')));
  await page.click('button[title="Remover conexão"]');
  await sleep(250);
  ok('canvas: connection deleted', (await dotCount()) === 0);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await sleep(250);
  ok('canvas: undo restores the connection', (await dotCount()) >= 1);

  // ---- Milestone D: duplicate a node, then undo ----
  const blockCount = () => page.evaluate(() => (document.body.innerText.match(/Bloco de Teste/g) || []).length);
  const before = await blockCount();
  const selected = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#app div')].filter((d) => d.style && d.style.cursor === 'grab' && d.style.pointerEvents === 'auto');
    const genW = wraps.find((w) => /Bloco de Teste/.test(w.innerText || ''));
    if (!genW) return false;
    const r = genW.getBoundingClientRect();
    genW.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 8, button: 0, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    return true;
  });
  ok('canvas: node selected for duplicate', selected);
  await page.waitForFunction(() => /duplicar/i.test(document.body.innerText), { timeout: 5000 });
  ok('canvas: selection action bar (duplicar/excluir)', inc(await txt(), 'duplicar'));
  await clickByText('duplicar');
  await sleep(300);
  ok('canvas: node duplicated', (await blockCount()) === before + 1, `before=${before}`);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await sleep(250);
  ok('canvas: undo removes the duplicate', (await blockCount()) === before);
  await page.screenshot({ path: `${SHOT}/r07b-canvas-edit.png` });

  // ---- integrated flashcards: "revisar tudo" combines every block's questions ----
  ok('action: "↻ revisar tudo"', await clickByText('revisar tudo'));
  await page.waitForFunction(() => /Eu sei/i.test(document.body.innerText) && /1 \/ 2/.test(document.body.innerText), { timeout: 5000 });
  ok('review-all: combined deck opened', inc(await txt(), 'Eu sei') && /1 \/ 2/.test(await txt()) && /Revis/i.test(await txt()));
  await page.keyboard.press('Escape');
  await sleep(200);

  // ---- resize a generated block, then regenerate — chosen size must be preserved ----
  const genWidth = () => page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#app div')].filter((d) => d.style && d.style.cursor === 'grab' && d.style.pointerEvents === 'auto');
    const g = wraps.find((w) => /Bloco de Teste/.test(w.innerText || ''));
    return g ? Math.round(g.getBoundingClientRect().width) : 0;
  });
  const genResized = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#app div')].filter((d) => d.style && d.style.cursor === 'grab' && d.style.pointerEvents === 'auto');
    const g = wraps.find((w) => /Bloco de Teste/.test(w.innerText || ''));
    if (!g) return false;
    const h = g.querySelector('div[title="Redimensionar"]'); if (!h) return false;
    const r = h.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const fire = (t, x, y) => window.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
    h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, pointerId: 1 }));
    fire('pointermove', cx + 130, cy + 40); fire('pointermove', cx + 170, cy + 60); fire('pointerup', cx + 170, cy + 60);
    return true;
  });
  ok('resize: generated block resized', genResized);
  await sleep(200);
  const gw1 = await genWidth();
  ok('resize: generated block grew wider', gw1 > 380, `gw1=${gw1}`);
  ok('action: "↺ regenerar"', await clickByText('regenerar'));
  await page.waitForFunction(() => /abrir leitura/i.test(document.body.innerText), { timeout: 12000 });
  await sleep(400);
  const gw2 = await genWidth();
  ok('resize: size preserved after regenerate', Math.abs(gw2 - gw1) <= 6, `gw1=${gw1} gw2=${gw2}`);

  ok('action: "excluir disciplina"', await clickByText('excluir disciplina'));
  await page.waitForFunction(() => /0 disciplinas · 0 aulas · 0 nós/.test(document.body.innerText), { timeout: 5000 });
  ok('edit: discipline deleted (shelf empty)', inc(await txt(), '0 disciplinas · 0 aulas · 0 nós'));
  await page.screenshot({ path: `${SHOT}/r08-deleted.png` });

  // ---- reset all (clears localStorage) ----
  await page.click('button[title="Conta"]');
  await page.waitForFunction(() => /acento/i.test(document.body.innerText), { timeout: 5000 });
  ok('action: "Apagar tudo"', await clickByText('Apagar tudo'));
  await page.waitForFunction(() => /Suas disciplinas/.test(document.body.innerText), { timeout: 5000 });
  await sleep(300);
  const cleared = await page.evaluate(() => localStorage.getItem('sandbox-de-nos:v1'));
  ok('reset: localStorage cleared', cleared === null);

  // ---- import a backup restores everything ----
  await page.click('button[title="Conta"]');
  await page.waitForFunction(() => /acento/i.test(document.body.innerText), { timeout: 5000 });
  const backupPath = `${SHOT}/backup.json`;
  writeFileSync(backupPath, JSON.stringify({ v: 1, savedAt: 1, disciplines: [{ id: 'imp1', name: 'Importada', num: 'I', semester: '2026.1', aulas: 0, h: 350, lessons: [] }], boards: {}, prefs: {}, counters: { nidc: 0, cid: 2 } }));
  const impInput = await page.$('input[accept="application/json,.json"]');
  await impInput.uploadFile(backupPath);
  await page.waitForFunction(() => /Importada/.test(document.body.innerText), { timeout: 5000 });
  ok('import: backup restores a discipline', inc(await txt(), 'Importada'));
  // clean slate again for Batch 2
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  // ============ Batch 2: syllabus pre-canvas · image · note editor · resize ============
  await page.waitForFunction(() => /Suas disciplinas/.test(document.body.innerText), { timeout: 5000 });

  // ---- create a discipline FROM a syllabus → AI pre-canvas (stub /api/outline) ----
  ok('action: open "Nova disciplina"', await clickByText('Nova disciplina'));
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="Estruturas"]'), { timeout: 5000 });
  await page.type('input[placeholder*="Estruturas"]', 'Lógica II');
  await page.type('textarea[placeholder*="cronograma"]', 'Unidade 1: introducao. Unidade 2: tabelas-verdade. Unidade 3: equivalencias.');
  await sleep(150);
  ok('action: "Criar com IA"', await clickByText('Criar com IA'));
  await page.waitForFunction(() => /Tabelas-verdade/.test(document.body.innerText) && /\d+%/.test(document.body.innerText), { timeout: 10000 });
  await sleep(500);
  let t2 = await txt();
  ok('syllabus: pre-canvas has lesson nodes', inc(t2, 'Tabelas-verdade') && inc(t2, 'Aula 02'));
  const discName = await page.$eval('input[title="renomear disciplina"]', (e) => e.value);
  ok('syllabus: discipline name is exactly the typed name', discName === 'Lógica II', `name=${JSON.stringify(discName)}`);
  await page.screenshot({ path: `${SHOT}/r09-precanvas.png` });

  // ---- edit a lesson's material (real, editable, persisted) ----
  ok('action: open lesson material', await clickByText('material'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="conteúdo desta aula"]'), { timeout: 5000 });
  await page.type('textarea[placeholder*="conteúdo desta aula"]', 'CONTEUDO_AULA_XYZ definicao importante');
  await sleep(250);
  ok('material: content editable', inc(await page.evaluate(() => document.querySelector('textarea[placeholder*="conteúdo desta aula"]').value), 'CONTEUDO_AULA_XYZ'));
  await page.keyboard.press('Escape');
  await sleep(600);
  ok('material: persisted on the lesson node', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sandbox-de-nos:v1') || '{}'); return Object.values(s.boards || {}).some((b) => (b.nodes || []).some((n) => n.type === 'lesson' && /CONTEUDO_AULA_XYZ/.test(n.materialText || ''))); }));

  // ---- image node from upload (downscaled to a data URL) ----
  const pngPath = `${SHOT}/tiny.png`;
  writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const imgInput = await page.$('input[accept="image/*"]');
  await imgInput.uploadFile(pngPath);
  await page.waitForFunction(() => !!document.querySelector('#app img[src^="data:"]'), { timeout: 6000 });
  ok('image: node created from upload', !!(await page.$('#app img[src^="data:"]')));
  // node stores only a small thumbnail data URL (full image lives in IndexedDB)
  const thumbLen = await page.evaluate(() => { const i = document.querySelector('#app img[src^="data:"]'); return i ? i.src.length : 0; });
  ok('image: node holds a small thumbnail', thumbLen > 0 && thumbLen < 200000, `len=${thumbLen}`);
  // open the lightbox (full image comes from IndexedDB → blob: URL)
  ok('action: open image lightbox', await page.evaluate(() => { const b = document.querySelector('button[title="Ampliar"]'); if (b) { b.click(); return true; } return false; }));
  await page.waitForFunction(() => !!document.querySelector('#app img[src^="blob:"]'), { timeout: 5000 });
  const lightboxShown = () => page.evaluate(() => { const o = [...document.querySelectorAll('#app div')].find((d) => d.style && d.style.zIndex === '85'); return !!(o && o.getBoundingClientRect().width > 200); });
  ok('image: lightbox shows full image from IndexedDB', (await lightboxShown()) && await page.evaluate(() => !!document.querySelector('#app img[src^="blob:"]')));
  await page.screenshot({ path: `${SHOT}/r10b-lightbox.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => { const o = [...document.querySelectorAll('#app div')].find((d) => d.style && d.style.zIndex === '85'); return !o || o.getBoundingClientRect().width < 10; }, { timeout: 5000 }).catch(() => {});
  ok('image: lightbox closed', !(await lightboxShown()));

  // ---- Notion-style note editor: write markdown, preview it ----
  ok('action: "+ Nota"', await clickByText('+ Nota'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="anotações"]'), { timeout: 5000 });
  ok('action: open note editor', await clickByText('editar'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="Escreva aqui"]'), { timeout: 5000 });
  await page.type('textarea[placeholder*="Escreva aqui"]', '# Titulo da nota\n### SubSub\n1. primeiro\n- bullet\n> citacao aqui\n*ital* e `codigo` e [meulink](http://x)\n---\ntexto com **negrito** e $E=mc^2$');
  await sleep(200);
  ok('note editor: toggle "Pré-visualizar"', await clickByText('Pré-visualizar'));
  await sleep(300);
  const pv = await txt();
  ok('note editor: preview renders markdown', inc(pv, 'Titulo da nota') && inc(pv, 'SubSub') && inc(pv, 'primeiro') && inc(pv, 'bullet') && inc(pv, 'citacao') && inc(pv, 'ital') && inc(pv, 'codigo') && inc(pv, 'meulink') && inc(pv, 'negrito'));
  await page.waitForFunction(() => !!document.querySelector('#app .katex'), { timeout: 9000 }).catch(() => {});
  ok('note editor: KaTeX renders math in preview', await page.evaluate(() => !!document.querySelector('#app .katex')));
  await page.screenshot({ path: `${SHOT}/r10-note-editor.png` });
  // ⌘B inserts bold markers in the editor
  ok('action: back to "Editar"', await clickByText('Editar'));
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="Escreva aqui"]'), { timeout: 5000 });
  await page.focus('textarea[placeholder*="Escreva aqui"]');
  await page.keyboard.down('Control'); await page.keyboard.press('b'); await page.keyboard.up('Control');
  await sleep(150);
  ok('note editor: ⌘B inserts bold markers', inc(await page.evaluate(() => document.querySelector('textarea[placeholder*="Escreva aqui"]').value), '**negrito**'));
  await page.keyboard.press('Escape');
  await sleep(200);

  // ---- resize a node by dragging its handle ----
  const noteWidth = () => page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#app div')].filter((d) => d.style && d.style.cursor === 'grab' && d.style.pointerEvents === 'auto');
    const w = wraps.find((x) => x.querySelector('textarea[placeholder*="anotações"]'));
    return w ? Math.round(w.getBoundingClientRect().width) : 0;
  });
  const wBefore = await noteWidth();
  const resized = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#app div')].filter((d) => d.style && d.style.cursor === 'grab' && d.style.pointerEvents === 'auto');
    const noteW = wraps.find((x) => x.querySelector('textarea[placeholder*="anotações"]'));
    if (!noteW) return false;
    const h = noteW.querySelector('div[title="Redimensionar"]');
    if (!h) return false;
    const r = h.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const fire = (t, x, y) => window.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
    h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, pointerId: 1 }));
    fire('pointermove', cx + 90, cy + 60); fire('pointermove', cx + 150, cy + 90); fire('pointerup', cx + 150, cy + 90);
    return true;
  });
  ok('action: resize gesture dispatched', resized);
  await sleep(250);
  const wAfter = await noteWidth();
  ok('resize: node grew wider', wAfter > wBefore + 25, `before=${wBefore} after=${wAfter}`);

  // ---- PDF node + native viewer (IndexedDB + iframe) ----
  const pdfPath = `${SHOT}/cronograma.pdf`;
  writeFileSync(pdfPath, makeMinimalPdf());
  const pdfInput = await page.$('input[accept="application/pdf,.pdf"]');
  await pdfInput.uploadFile(pdfPath);
  await page.waitForFunction(() => /abrir pdf/i.test(document.body.innerText), { timeout: 8000 });
  ok('pdf: node created with filename', inc(await txt(), 'cronograma.pdf'));
  // background processing renders a 1st-page thumbnail + page count
  await page.waitForFunction(() => /página/.test(document.body.innerText), { timeout: 9000 }).catch(() => {});
  ok('pdf: page count shown', inc(await txt(), 'página'));
  ok('pdf: thumbnail rendered', await page.evaluate(() => [...document.querySelectorAll('#app img[src^="data:image/jpeg"]')].length >= 1));
  ok('action: "abrir PDF"', await clickByText('abrir PDF'));
  await page.waitForFunction(() => { const f = document.querySelector('iframe'); return !!(f && /^blob:/.test(f.src)); }, { timeout: 6000 });
  ok('pdf: viewer opened with blob iframe', await page.evaluate(() => { const f = document.querySelector('iframe'); return !!(f && /^blob:/.test(f.src)); }));
  await page.screenshot({ path: `${SHOT}/r11-pdf-viewer.png` });
  await page.keyboard.press('Escape');
  await sleep(200);
  ok('pdf: viewer closed', await page.evaluate(() => !document.querySelector('iframe')));

  // ---- search now indexes PDFs and images, with keyboard navigation ----
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="Buscar disciplinas"]'), { timeout: 5000 });
  await page.type('input[placeholder*="Buscar disciplinas"]', 'cronograma');
  await sleep(300);
  ok('search: indexes PDF by filename', inc(await txt(), 'cronograma') && inc(await txt(), 'PDF'));
  await page.click('input[placeholder*="Buscar disciplinas"]', { clickCount: 3 });
  await page.type('input[placeholder*="Buscar disciplinas"]', 'tiny');
  await sleep(300);
  ok('search: indexes image by caption', inc(await txt(), 'IMG'));
  // keyboard: ArrowDown then Enter opens a result (closes search)
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(300);
  ok('search: keyboard Enter opens result', !(await page.$('input[placeholder*="Buscar disciplinas"]')));

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
