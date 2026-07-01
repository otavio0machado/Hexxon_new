class Component extends DCLogic {
  // --- Identidade (edite aqui para personalizar quem usa o app) ---
  IDENT = { name: 'Estudante', initials: 'ES', email: '', course: '', term: '2026.1' };
  STORAGE_KEY = 'sandbox-de-nos:v1';

  TRUTH = {
    head: ['p', 'q', 'p→q', '¬q→¬p', '∧'],
    rows: [['V','V','V','V','V'], ['V','F','F','F','F'], ['F','V','V','V','V'], ['F','F','V','V','V']],
  };
  CONN = [
    { sym: '¬', name: 'Negação', read: 'não p' },
    { sym: '∧', name: 'Conjunção', read: 'p e q' },
    { sym: '∨', name: 'Disjunção', read: 'p ou q' },
    { sym: '→', name: 'Condicional', read: 'se p então q' },
    { sym: '↔', name: 'Bicondicional', read: 'p se e somente se q' },
  ];

  DISCIPLINES = []; // começa vazio — o usuário cria as próprias disciplinas

  cid = 2;
  nidc = 0;
  dynNum = 7;
  histStack = [];
  redoStack = [];

  state = {
    screen: 'biblioteca',
    activeDisc: null,
    prefs: { accent: null, serif: null, grid: null, showHints: true },
    pan: { x: 0, y: 0 }, zoom: 0.95, panning: false,
    selectedId: null, selectedConnId: null, drag: null, movingId: null, gen: null, popover: null,
    hintOpen: true,
    reading: null, material: null, search: null, newDisc: null, toast: null, flash: null,
    discMenu: null, renameDisc: null, noteEdit: null, pdfView: null, imgView: null,
    cloud: false, session: null, authScreen: null,
    disciplines: this.DISCIPLINES.slice(),
    boards: {},
    nodes: [], connections: [],
  };

  starterBoard(d) {
    const nodes = [{ id: 't', type: 'title', x: -180, y: -86, w: 360, h: 172, locked: true, shortLabel: d.name, titleBig: d.name, titleMeta: d.semester + ' · ' + d.aulas + ' aulas', kickerLabel: 'Disciplina' }];
    const conns = [];
    const ls = d.lessons || [];
    const R = 330, cx = 0, cy = 0;
    ls.forEach((title, i) => {
      const ang = (-90 + i * (360 / Math.max(ls.length, 1))) * Math.PI / 180;
      const w = 250, h = 120;
      const px = cx + R * Math.cos(ang) - w / 2;
      const py = cy + R * Math.sin(ang) - h / 2 + 40;
      const num = String(i + 1).padStart(2, '0');
      const id = 'l' + i;
      nodes.push({ id, type: 'lesson', x: px, y: py, w, h, shortLabel: 'Aula ' + num, kicker: 'Aula ' + num, titleText: title, material: 'material · ' + (10 + i * 4) + ' págs', lessonKey: d.id + '-' + num, pages: 3 });
      conns.push({ id: 'sc' + i, from: 't', to: id });
    });
    return { nodes, connections: conns };
  }

  componentDidMount() {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('paste', this.onPaste);
    this.loadKatex();
    this.initCloud();
  }

  // ---------- math (KaTeX) — render $...$ and $$...$$ across the app ----------
  loadKatex() {
    if (window.katex || this._katexLoading) return;
    this._katexLoading = true;
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
      s.onload = () => { try { this.forceUpdate(); } catch (e) {} };
      document.head.appendChild(s);
    } catch (e) {}
  }
  mathToHtml(tex, display) {
    if (!window.katex) return null;
    try { return window.katex.renderToString(tex, { displayMode: !!display, throwOnError: false, output: 'html' }); } catch (e) { return null; }
  }
  splitMath(text) {
    const out = []; const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ math: false, value: text.slice(last, m.index) });
      if (m[1] != null) out.push({ math: true, display: true, value: m[1] });
      else out.push({ math: true, display: false, value: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ math: false, value: text.slice(last) });
    return out;
  }
  // returns a plain string (fast path) or an array of keyed React elements
  richInline(text, withMd) {
    text = text || '';
    if (text.indexOf('$') < 0) return withMd ? this.mdInline(text) : text;
    const R = window.React; const toks = this.splitMath(text); const out = []; let k = 0;
    toks.forEach(tk => {
      if (tk.math) {
        const html = this.mathToHtml(tk.value, tk.display);
        if (html) out.push(R.createElement(tk.display ? 'div' : 'span', { key: 'm' + (k++), style: tk.display ? { margin: '6px 0' } : null, dangerouslySetInnerHTML: { __html: html } }));
        else { const d = tk.display ? '$$' : '$'; out.push(R.createElement('span', { key: 'm' + (k++) }, d + tk.value + d)); }
      } else {
        const seg = withMd ? this.mdInline(tk.value) : tk.value;
        if (typeof seg === 'string') out.push(R.createElement('span', { key: 't' + (k++) }, seg));
        else out.push(R.createElement(R.Fragment, { key: 't' + (k++) }, seg));
      }
    });
    return out;
  }
  componentWillUnmount() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('paste', this.onPaste);
    this.clearGenTimers();
    clearTimeout(this.tt);
    clearTimeout(this._pt);
    clearTimeout(this._cpt);
    if (this.pdfEl) { try { this.pdfEl.remove(); } catch (e) {} } this.hidePdfToolbar();
    if (this.vp) this.vp.removeEventListener('wheel', this.onWheel);
  }

  // ---------- persistence (localStorage) ----------
  componentDidUpdate() { this.schedulePersist(); }
  schedulePersist() { clearTimeout(this._pt); this._pt = setTimeout(() => this.persist(), 400); }
  snapshot() {
    const S = this.state;
    const boards = { ...S.boards };
    if (S.screen === 'canvas' && S.activeDisc) boards[S.activeDisc] = { nodes: S.nodes, connections: S.connections };
    return { v: 1, savedAt: Date.now(), disciplines: S.disciplines, boards, prefs: S.prefs, counters: { nidc: this.nidc, cid: this.cid } };
  }
  persist() {
    const snap = this.snapshot();
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(snap)); this._quotaWarned = false; }
    catch (e) { if (!this._quotaWarned) { this._quotaWarned = true; this.toast('Armazenamento local cheio — exporte um backup e remova conteúdo (imagens/PDF pesam).'); } }
    if (this.state.cloud && this.session && this.sb) this.pushCloud(snap);
  }
  // ---------- export / import (JSON backup of everything in localStorage) ----------
  exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'sandbox-de-nos-backup.json'; a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 1500);
      this.toast('Backup exportado');
    } catch (e) { this.toast('Falha ao exportar'); }
  };
  setImportInput = (el) => { this.importInput = el; };
  pickImport = () => { if (this.importInput) this.importInput.click(); };
  onImportFile = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || d.v !== 1) { this.toast('Arquivo de backup inválido'); return; }
      this.clearGenTimers();
      this.applySnapshot(d);
      this.toast('Backup importado');
    } catch (er) { this.toast('Falha ao importar o backup'); }
  };
  applySnapshot(d) {
    if (!d) return;
    if (d.counters) { this.nidc = d.counters.nidc || 0; this.cid = d.counters.cid || 2; }
    this.resetHist();
    this.setState({
      disciplines: Array.isArray(d.disciplines) ? d.disciplines : [],
      boards: d.boards && typeof d.boards === 'object' ? d.boards : {},
      prefs: { ...this.state.prefs, ...(d.prefs || {}) },
      screen: 'biblioteca', activeDisc: null, nodes: [], connections: [], selectedId: null, popover: null,
    });
  }
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v === 1) this.applySnapshot(d);
    } catch (e) {}
  }

  // ---------- cloud (Supabase) — optional; stays off when /api/config has no creds ----------
  async initCloud() {
    let cfg = null;
    try { const r = await fetch('/api/config'); if (r.ok) cfg = await r.json(); } catch (e) {}
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) { this.load(); return; } // local-only mode
    try {
      await this.loadSupabaseJs();
      this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    } catch (e) { this.load(); return; } // CDN/init failed → fall back to local
    this.setState({ cloud: true });
    let session = null;
    try { const { data } = await this.sb.auth.getSession(); session = data && data.session; } catch (e) {}
    if (session) { this.session = session; this.setState({ session: { email: session.user.email }, authScreen: null }); await this.loadCloud(); }
    else { this.load(); this.setState({ authScreen: { stage: 'email', email: '', code: '', sending: false } }); }
    try {
      this.sb.auth.onAuthStateChange((_evt, sess) => {
        if (sess && !this.session) { this.session = sess; this.setState({ session: { email: sess.user.email }, authScreen: null }); this.loadCloud(); }
        else if (!sess && this.session) { this.session = null; this.setState({ session: null }); }
      });
    } catch (e) {}
  }
  loadSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (this._sbP) return this._sbP;
    this._sbP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
      s.onload = () => (window.supabase && window.supabase.createClient) ? resolve(window.supabase) : reject(new Error('global'));
      s.onerror = () => reject(new Error('cdn'));
      document.head.appendChild(s);
    });
    return this._sbP;
  }
  async loadCloud() {
    if (!this.sb || !this.session) return;
    let remote = null;
    try { const { data } = await this.sb.from('sdn_state').select('data').eq('user_id', this.session.user.id).maybeSingle(); remote = data && data.data; } catch (e) {}
    let local = null;
    try { const raw = localStorage.getItem(this.STORAGE_KEY); if (raw) { const d = JSON.parse(raw); if (d && d.v === 1) local = d; } } catch (e) {}
    const remoteOk = remote && remote.v === 1;
    const localHas = local && (local.disciplines || []).length;
    if (remoteOk && localHas) {
      // newest wins (avoids clobbering unsynced local edits)
      if ((local.savedAt || 0) > (remote.savedAt || 0)) { this.applySnapshot(local); this.pushCloud(local); this.toast('Enviei suas mudanças locais mais recentes para a nuvem'); }
      else this.applySnapshot(remote);
    } else if (remoteOk) { this.applySnapshot(remote); }
    else if (localHas) { this.applySnapshot(local); this.pushCloud(local); this.toast('Seus dados locais foram enviados para a nuvem'); }
    else { this.applySnapshot({ disciplines: [], boards: {}, prefs: {}, counters: {} }); }
  }
  pushCloud(snap) {
    if (!this.sb || !this.session) return;
    this._cloudSnap = snap;
    clearTimeout(this._cpt);
    this._cpt = setTimeout(() => {
      const payload = { user_id: this.session.user.id, data: this._cloudSnap, updated_at: new Date().toISOString() };
      try { this.sb.from('sdn_state').upsert(payload).then(() => {}, () => {}); } catch (e) {}
    }, 700);
  }

  // ---------- auth (passwordless e-mail code) ----------
  setAuthEmail = (e) => { const a = this.state.authScreen; if (a) this.setState({ authScreen: { ...a, email: e.target.value } }); };
  setAuthCode = (e) => { const a = this.state.authScreen; if (a) this.setState({ authScreen: { ...a, code: e.target.value } }); };
  onAuthKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); const a = this.state.authScreen; if (a && a.stage === 'code') this.verifyCode(); else this.sendCode(); } };
  sendCode = async () => {
    const a = this.state.authScreen; if (!a || !this.sb) return;
    const email = (a.email || '').trim();
    if (!/.+@.+\..+/.test(email)) { this.toast('Digite um e-mail válido'); return; }
    this.setState({ authScreen: { ...a, sending: true } });
    try {
      const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
      this.setState({ authScreen: { ...this.state.authScreen, stage: 'code', sending: false } });
      this.toast('Código enviado para ' + email);
    } catch (e) { this.setState({ authScreen: { ...this.state.authScreen, sending: false } }); this.toast('Falha ao enviar o código'); }
  };
  verifyCode = async () => {
    const a = this.state.authScreen; if (!a || !this.sb) return;
    const email = (a.email || '').trim(); const token = (a.code || '').trim();
    if (!token) { this.toast('Digite o código recebido'); return; }
    this.setState({ authScreen: { ...a, sending: true } });
    try {
      const { data, error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      if (data && data.session) { this.session = data.session; this.setState({ session: { email: data.session.user.email }, authScreen: null }); await this.loadCloud(); }
    } catch (e) { this.setState({ authScreen: { ...this.state.authScreen, sending: false } }); this.toast('Código inválido ou expirado'); }
  };
  changeAuthEmail = () => { const a = this.state.authScreen; if (a) this.setState({ authScreen: { stage: 'email', email: a.email, code: '', sending: false } }); };
  logout = async () => {
    try { if (this.sb) await this.sb.auth.signOut(); } catch (e) {}
    this.session = null; this.nidc = 0; this.cid = 2; this.clearGenTimers();
    this.setState({ session: null, disciplines: [], boards: {}, nodes: [], connections: [], screen: 'biblioteca', activeDisc: null, selectedId: null, popover: null, reading: null, material: null, flash: null, authScreen: { stage: 'email', email: '', code: '', sending: false } });
  };
  resetAll = () => {
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
    this.idbClear();
    this.nidc = 0; this.cid = 2;
    this.clearGenTimers();
    this.setState({
      screen: 'biblioteca', activeDisc: null, disciplines: [], boards: {},
      nodes: [], connections: [], selectedId: null, popover: null, gen: null,
      reading: null, material: null, search: null, newDisc: null,
    });
    this.toast('Tudo apagado — comece do zero');
  };

  setVp = (el) => {
    if (this.vp && this.vp !== el) this.vp.removeEventListener('wheel', this.onWheel);
    this.vp = el;
    if (el) {
      el.addEventListener('wheel', this.onWheel, { passive: false });
      requestAnimationFrame(() => this.fitView());
      setTimeout(() => this.fitView(), 70);
    }
  };
  // focus a field shortly after mount, but never steal focus the user already
  // moved to another text field (avoids races with fast typing across fields)
  autoFocus(el, select) {
    if (!el) return;
    setTimeout(() => {
      try {
        const a = document.activeElement;
        if (a === el) return; // already focused — don't re-select mid-typing
        if (a && /input|textarea/i.test(a.tagName)) return; // user is typing elsewhere
        el.focus(); if (select && el.select) el.select();
      } catch (e) {}
    }, 25);
  }
  setAiInput = (el) => { this.aiInput = el; this.autoFocus(el); };
  setSearchInput = (el) => { this.autoFocus(el); };
  setNewName = (el) => { this.newNameEl = el; this.autoFocus(el); };
  setNewSem = (el) => { this.newSemEl = el; };
  stop = (e) => { e.stopPropagation(); };
  onResize = () => this.forceUpdate();

  byId() { const m = {}; this.state.nodes.forEach(n => { m[n.id] = n; }); return m; }
  disc(id) { return this.state.disciplines.find(d => d.id === id); }

  screenToWorld(cx, cy) {
    const r = this.vp.getBoundingClientRect();
    const S = this.state;
    return { x: (cx - r.left - S.pan.x) / S.zoom, y: (cy - r.top - S.pan.y) / S.zoom };
  }
  nodeAt(wx, wy, exclude) {
    const ns = this.state.nodes;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.id === exclude) continue;
      if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n;
    }
    return null;
  }
  selectNode(id) {
    const patch = { selectedId: id, selectedConnId: null };
    if (this.state.popover && this.state.popover.nodeId !== id) patch.popover = null;
    this.setState(patch);
  }

  // ---------- undo / redo (per-board canvas history) ----------
  cloneBoard() {
    return { nodes: this.state.nodes.map(n => ({ ...n })), connections: this.state.connections.map(c => ({ ...c })) };
  }
  pushHist() {
    if (this.state.screen !== 'canvas') return;
    this.histStack.push(this.cloneBoard());
    if (this.histStack.length > 60) this.histStack.shift();
    this.redoStack = [];
  }
  resetHist() { this.histStack = []; this.redoStack = []; }
  undo = () => {
    if (this.state.screen !== 'canvas' || !this.histStack.length) { this.toast('Nada para desfazer'); return; }
    this.redoStack.push(this.cloneBoard());
    const prev = this.histStack.pop();
    this.clearGenTimers();
    this.setState({ nodes: prev.nodes, connections: prev.connections, selectedId: null, selectedConnId: null, popover: null, gen: null });
    this.toast('Desfeito');
  };
  redo = () => {
    if (this.state.screen !== 'canvas' || !this.redoStack.length) return;
    this.histStack.push(this.cloneBoard());
    const next = this.redoStack.pop();
    this.clearGenTimers();
    this.setState({ nodes: next.nodes, connections: next.connections, selectedId: null, selectedConnId: null, popover: null, gen: null });
    this.toast('Refeito');
  };

  // ---------- connection select / delete, node duplicate ----------
  selectConn(id) { this.setState({ selectedConnId: id, selectedId: null, popover: null }); }
  deleteConn = (id) => {
    id = id || this.state.selectedConnId;
    if (!id) return;
    this.pushHist();
    this.setState({ connections: this.state.connections.filter(c => c.id !== id), selectedConnId: null });
    this.toast('Conexão removida');
  };
  duplicateNode = (id) => {
    id = id || this.state.selectedId;
    const n = this.byId()[id];
    if (!n) { this.toast('Selecione um nó para duplicar'); return; }
    if (n.type === 'title' || n.locked) { this.toast('Este nó não pode ser duplicado'); return; }
    this.pushHist();
    const nid = 'n' + (++this.nidc);
    const copy = { ...n, id: nid, x: n.x + 30, y: n.y + 30 };
    if (copy.questions) copy.questions = copy.questions.map(q => ({ ...q, solution: (q.solution || []).slice() }));
    this.setState({ nodes: [...this.state.nodes, copy], selectedId: nid, selectedConnId: null, popover: null });
    this.toast('Nó duplicado');
  };

  // ---------- navigation ----------
  goHome = () => { this.saveBoard(); this.setState({ screen: 'biblioteca', selectedId: null, popover: null }); };
  openConta = () => { this.saveBoard(); this.setState({ screen: 'conta', popover: null }); };

  saveBoard() {
    if (this.state.screen !== 'canvas') return;
    const boards = { ...this.state.boards, [this.state.activeDisc]: { nodes: this.state.nodes, connections: this.state.connections } };
    this.setState({ boards });
  }

  openDiscipline = (id) => {
    const boards = { ...this.state.boards };
    if (this.state.screen === 'canvas') boards[this.state.activeDisc] = { nodes: this.state.nodes, connections: this.state.connections };
    let target = boards[id];
    if (!target) { target = this.starterBoard(this.disc(id)); boards[id] = target; }
    this.clearGenTimers();
    this.resetHist();
    this.setState({
      screen: 'canvas', activeDisc: id, boards,
      nodes: target.nodes, connections: target.connections,
      selectedId: null, selectedConnId: null, popover: null, gen: null, drag: null,
      reading: null, material: null, search: null,
      hintOpen: this.state.prefs.showHints,
    });
    requestAnimationFrame(() => this.fitView());
    setTimeout(() => this.fitView(), 60);
  };

  // ---------- canvas pointer ----------
  onBgPointerDown = (e) => {
    if (e.button !== 0) return;
    const S = this.state;
    this.g = { type: 'pan', sx: e.clientX, sy: e.clientY, px: S.pan.x, py: S.pan.y, moved: false };
  };
  onBgDblClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.createNodeAt(w.x, w.y);
  };
  nodeDown = (e, id) => {
    e.stopPropagation();
    this.selectNode(id);
    const n = this.byId()[id];
    this.g = { type: 'node', id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
  };
  handleDown = (e, id) => {
    e.stopPropagation();
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.g = { type: 'conn', fromId: id, moved: false };
    this.setState({ drag: { fromId: id, cur: w, overId: null } });
  };
  MIN_W = { note: 200, image: 130, generated: 220, pdf: 230, lesson: 190 };
  MIN_H = { note: 150, image: 110, generated: 150, pdf: 120, lesson: 96 };
  resizeDown = (e, id) => {
    e.stopPropagation();
    this.selectNode(id);
    const n = this.byId()[id];
    this.g = { type: 'resize', id, sx: e.clientX, sy: e.clientY, ow: n.w, oh: n.h || 156, moved: false };
  };
  onMove = (e) => {
    const g = this.g;
    if (!g) return;
    if (g.type === 'pan') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      this.setState({ pan: { x: g.px + dx, y: g.py + dy }, panning: true });
    } else if (g.type === 'node') {
      const z = this.state.zoom;
      const dx = (e.clientX - g.sx) / z, dy = (e.clientY - g.sy) / z;
      if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 3 && !g.moved) { g.moved = true; this.pushHist(); this.setState({ movingId: g.id }); }
      this.setState({ nodes: this.state.nodes.map(n => n.id === g.id ? { ...n, x: g.ox + dx, y: g.oy + dy } : n) });
    } else if (g.type === 'resize') {
      const z = this.state.zoom;
      const dx = (e.clientX - g.sx) / z, dy = (e.clientY - g.sy) / z;
      if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 3 && !g.moved) { g.moved = true; this.pushHist(); }
      const n0 = this.byId()[g.id]; const t = n0 ? n0.type : 'note';
      const minW = this.MIN_W[t] || 160, minH = this.MIN_H[t] || 100;
      const w = Math.round(Math.max(minW, g.ow + dx)), h = Math.round(Math.max(minH, g.oh + dy));
      // userSized marks the node so (re)generation never clobbers the chosen size
      this.setState({ nodes: this.state.nodes.map(n => n.id === g.id ? { ...n, w, h, userSized: true } : n) });
    } else if (g.type === 'conn') {
      const w = this.screenToWorld(e.clientX, e.clientY);
      const over = this.nodeAt(w.x, w.y, g.fromId);
      this.setState({ drag: { fromId: g.fromId, cur: w, overId: over ? over.id : null } });
    }
  };
  onUp = () => {
    const g = this.g;
    if (!g) return;
    this.g = null;
    if (this.state.movingId) this.setState({ movingId: null });
    if (g.type === 'pan') {
      this.setState({ panning: false });
      if (!g.moved) this.setState({ selectedId: null, selectedConnId: null, popover: null });
    } else if (g.type === 'conn') {
      const d = this.state.drag;
      this.setState({ drag: null });
      if (d && d.overId && d.overId !== g.fromId) this.addConn(g.fromId, d.overId);
    }
  };
  addConn(from, to) {
    if (from === to) return;
    const exists = this.state.connections.some(c => (c.from === from && c.to === to) || (c.from === to && c.to === from));
    if (exists) return;
    this.pushHist();
    this.setState({ connections: [...this.state.connections, { id: 'c' + (++this.cid), from, to }] });
  }
  // approximate footprint of a node for collision tests
  nodeBox(n) { return { x: n.x, y: n.y, w: n.w || 280, h: n.h || (n.type === 'generated' ? 170 : n.type === 'title' ? 150 : 160) }; }
  boxesHit(a, b, gap) { return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y; }
  // nudge a desired top-left so the new node doesn't land on top of an existing one
  avoidOverlap(x, y, w, h) {
    const gap = 26; const others = (this.state.nodes || []).map(n => this.nodeBox(n));
    const free = (bx, by) => !others.some(o => this.boxesHit({ x: bx, y: by, w, h }, o, gap));
    if (free(x, y)) return { x, y };
    const step = Math.max(58, Math.round(h * 0.5));
    for (let ring = 1; ring <= 16; ring++) {
      const d = ring * step;
      const cands = [[x, y + d], [x + d, y], [x - d, y], [x, y - d], [x + d, y + d], [x - d, y + d], [x + d, y - d], [x - d, y - d]];
      for (const [cx, cy] of cands) if (free(cx, cy)) return { x: cx, y: cy };
    }
    return { x: x + 44, y: y + 44 };
  }
  createNodeAt(wx, wy) {
    this.pushHist();
    const id = 'n' + (++this.nidc);
    const p = this.avoidOverlap(wx - 150, wy - 78, 300, 156);
    const node = { id, type: 'generated', x: p.x, y: p.y, w: 300, h: 156, filled: false, shortLabel: 'Novo nó' };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
    return id;
  }
  addNode = () => {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 26;
    const w = this.screenToWorld(r.left + r.width * 0.5 + j, r.top + r.height * 0.7 + j);
    return this.createNodeAt(w.x, w.y);
  };

  // ---------- material / note nodes (your own study content for the AI) ----------
  addNoteNode = () => this.createNote('Nota', '', 'texto');
  pickPdf = () => { if (this.fileInput) this.fileInput.click(); };
  setFileInput = (el) => { this.fileInput = el; };
  createNote(title, content, source) {
    if (this.state.screen !== 'canvas' || !this.vp) return;
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 24;
    const w = this.screenToWorld(r.left + r.width * 0.34 + j, r.top + r.height * 0.42 + j);
    this.pushHist();
    const id = 'n' + (++this.nidc);
    const p = this.avoidOverlap(w.x - 140, w.y - 96, 280, 196);
    const node = { id, type: 'note', x: p.x, y: p.y, w: 280, h: 196, title: title || 'Nota', content: content || '', source: source || 'texto', shortLabel: (title || 'Nota').slice(0, 18) };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
    return id;
  }
  setNoteContent(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, content: val } : n) }); }
  setNoteTitle(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, title: val, shortLabel: (val || 'Nota').slice(0, 18) } : n) }); }

  // ---------- Notion-style note editor (full-screen) ----------
  openNoteEditor = (id) => { const n = this.byId()[id]; if (!n || n.type !== 'note') return; this.setState({ noteEdit: { id, mode: 'edit' }, selectedId: id }); };
  closeNoteEditor = () => this.setState({ noteEdit: null });
  toggleNotePreview = () => { const e = this.state.noteEdit; if (e) this.setState({ noteEdit: { ...e, mode: e.mode === 'preview' ? 'edit' : 'preview' } }); };
  setNoteBodyRef = (el) => { this.noteBodyEl = el; this.autoFocus(el); };
  // ⌘B / ⌘I wrap the selection in the editor; ⌘K makes a link
  onNoteEditorKey = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k !== 'b' && k !== 'i') return;
    e.preventDefault();
    const ta = e.target; const mark = k === 'b' ? '**' : '*';
    const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
    const sel = v.slice(s, en) || (k === 'b' ? 'negrito' : 'itálico');
    const nv = v.slice(0, s) + mark + sel + mark + v.slice(en);
    const ne = this.state.noteEdit; if (ne) this.setNoteContent(ne.id, nv);
    setTimeout(() => { try { ta.focus(); ta.selectionStart = s + mark.length; ta.selectionEnd = s + mark.length + sel.length; } catch (er) {} }, 0);
  };
  // markdown: #/##/### headings, > quote, - / 1. lists, --- rule; **bold** *italic* `code` [link](url)
  mdInline(text) {
    text = text || '';
    if (!/[*`\[]/.test(text)) return text; // plain string (no key warnings)
    const R = window.React; const out = []; let k = 0, last = 0, m;
    const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
    const push = (s) => { if (s) out.push(R.createElement('span', { key: 't' + (k++) }, s)); };
    while ((m = re.exec(text))) {
      if (m.index > last) push(text.slice(last, m.index));
      if (m[2] != null) out.push(R.createElement('strong', { key: 'b' + (k++) }, m[2]));
      else if (m[4] != null) out.push(R.createElement('em', { key: 'i' + (k++) }, m[4]));
      else if (m[6] != null) out.push(R.createElement('code', { key: 'c' + (k++), style: { fontFamily: "'IBM Plex Mono',monospace", background: 'rgba(33,30,26,0.06)', padding: '1px 5px', borderRadius: '2px', fontSize: '0.9em' } }, m[6]));
      else if (m[8] != null) out.push(R.createElement('a', { key: 'a' + (k++), href: m[9], target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--ox)', textDecoration: 'underline' } }, m[8]));
      last = m.index + m[0].length;
    }
    if (last < text.length) push(text.slice(last));
    return out.length ? out : text;
  }
  mdBlocks(text) {
    return (text || '').split('\n').map((raw, idx) => {
      const t = raw.replace(/\s+$/, '');
      let kind = 'p', body = t, num = '';
      if (/^#\s+/.test(t)) { kind = 'h1'; body = t.replace(/^#\s+/, ''); }
      else if (/^##\s+/.test(t)) { kind = 'h2'; body = t.replace(/^##\s+/, ''); }
      else if (/^###\s+/.test(t)) { kind = 'h3'; body = t.replace(/^###\s+/, ''); }
      else if (/^>\s?/.test(t)) { kind = 'quote'; body = t.replace(/^>\s?/, ''); }
      else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { kind = 'hr'; body = ''; }
      else if (/^\d+\.\s+/.test(t)) { kind = 'ol'; num = (t.match(/^(\d+)\./) || [])[1] || ''; body = t.replace(/^\d+\.\s+/, ''); }
      else if (/^[-*]\s+/.test(t)) { kind = 'li'; body = t.replace(/^[-*]\s+/, ''); }
      else if (t.trim() === '') kind = 'sp';
      return { key: idx, kind, num: num + '.', content: this.richInline(body, true), isH1: kind === 'h1', isH2: kind === 'h2', isH3: kind === 'h3', isLi: kind === 'li', isOl: kind === 'ol', isQuote: kind === 'quote', isHr: kind === 'hr', isP: kind === 'p', isSp: kind === 'sp' };
    });
  }
  loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (this._pdfP) return this._pdfP;
    this._pdfP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/pdfjs-dist@3.11.174/legacy/build/pdf.min.js';
      s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js'; resolve(window.pdfjsLib); } catch (e) { reject(e); } };
      s.onerror = () => reject(new Error('cdn'));
      document.head.appendChild(s);
    });
    return this._pdfP;
  }
  async extractPdf(file) {
    const lib = await this.loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await lib.getDocument({ data }).promise;
    const maxPages = Math.min(pdf.numPages, 50);
    let text = '';
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      text += tc.items.map(i => i.str).join(' ') + '\n';
      if (text.length > 24000) break;
    }
    return text.replace(/[ \t]+/g, ' ').slice(0, 24000).trim();
  }
  // ---------- local file store (IndexedDB — large quota, stays on the device) ----------
  idb() {
    if (this._idb) return this._idb;
    this._idb = new Promise((resolve, reject) => {
      const req = indexedDB.open('sdn-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._idb;
  }
  async idbPutLocal(key, blob) { const db = await this.idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  async idbPut(key, blob) { await this.idbPutLocal(key, blob); this.cloudPutFile(key, blob); }
  async idbGet(key) {
    let local = null;
    try { const db = await this.idb(); local = await new Promise((res) => { const tx = db.transaction('files', 'readonly'); const r = tx.objectStore('files').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) {}
    if (local) return local;
    const remote = await this.cloudGetFile(key);            // fall back to cloud (other device)
    if (remote) { this.idbPutLocal(key, remote).catch(() => {}); return remote; }
    return null;
  }
  // optional file sync via Supabase Storage (bucket 'sdn-files', folder = user id) — no-op without cloud
  async cloudPutFile(key, blob) { if (!this.sb || !this.session || !blob) return; try { await this.sb.storage.from('sdn-files').upload(this.session.user.id + '/' + key, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' }); } catch (e) {} }
  async cloudGetFile(key) { if (!this.sb || !this.session) return null; try { const { data } = await this.sb.storage.from('sdn-files').download(this.session.user.id + '/' + key); return data || null; } catch (e) { return null; } }
  async cloudDelFile(key) { if (!this.sb || !this.session) return; try { await this.sb.storage.from('sdn-files').remove([this.session.user.id + '/' + key]); } catch (e) {} }
  async idbDel(key) { try { const db = await this.idb(); const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(key); } catch (e) {} this.cloudDelFile(key); }
  async idbClear() { try { const db = await this.idb(); const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').clear(); } catch (e) {} }
  delBoardFiles(board) { try { (board && board.nodes || []).forEach(n => { if (n.type === 'pdf' || n.type === 'image') this.idbDel(n.id); }); } catch (e) {} }

  onPdfPick = (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (this.state.screen !== 'canvas' || !this.vp) { this.toast('Abra um quadro para importar o PDF'); return; }
    const id = 'n' + (++this.nidc);
    this.createPdfNode(id, file.name, '');        // node appears immediately (viewable)
    this.idbPut(id, file).catch(() => {});         // store the file locally
    this.toast('PDF adicionado — abra para ver ou conecte (●) à IA');
    // in the background: extract text (for the AI), render a 1st-page thumbnail, count pages
    this.processPdf(file)
      .then((r) => { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, content: r.text || n.content, thumb: r.thumb || n.thumb, pages: r.pages || n.pages } : n) }); })
      .catch(() => {});
  };
  // single pass: text + 1st-page thumbnail + page count
  async processPdf(file) {
    const lib = await this.loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await lib.getDocument({ data }).promise;
    const pages = pdf.numPages;
    let text = '';
    const maxPages = Math.min(pages, 50);
    for (let p = 1; p <= maxPages; p++) {
      const pg = await pdf.getPage(p);
      const tc = await pg.getTextContent();
      text += tc.items.map(i => i.str).join(' ') + '\n';
      if (text.length > 24000) break;
    }
    text = text.replace(/[ \t]+/g, ' ').slice(0, 24000).trim();
    let thumb = '';
    try {
      const page = await pdf.getPage(1);
      const v0 = page.getViewport({ scale: 1 });
      const scale = Math.min(1.4, 360 / v0.width);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      thumb = c.toDataURL('image/jpeg', 0.7);
    } catch (e) {}
    return { text, thumb, pages };
  }
  createPdfNode(id, filename, text) {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 24;
    const w = this.screenToWorld(r.left + r.width * 0.4 + j, r.top + r.height * 0.42 + j);
    this.pushHist();
    const node = { id, type: 'pdf', x: w.x - 150, y: w.y - 72, w: 300, h: 150, filename: filename || 'documento.pdf', content: text || '', source: 'pdf', hasFile: true, thumb: '', pages: 0, shortLabel: (filename || 'PDF').replace(/\.pdf$/i, '').slice(0, 18) };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
  }
  // ---------- PDF viewer (pdf.js, selectable text) — imperative DOM overlay so React
  //            never reconciles away the rendered canvases. Inspired by PDF++:
  //            select text → create a note / highlight. -----------------------------
  injectPdfCss() {
    if (this._pdfCss) return; this._pdfCss = true;
    const s = document.createElement('style');
    s.textContent = [
      ".sdn-ov{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:26px;font-family:'IBM Plex Mono',ui-monospace,monospace;background:rgba(28,25,22,0.5);backdrop-filter:blur(6px) saturate(1.05);-webkit-backdrop-filter:blur(6px) saturate(1.05);opacity:0;transition:opacity .18s ease;}",
      ".sdn-ov.in{opacity:1;}",
      ".sdn-panel{width:100%;max-width:1220px;height:100%;background:#FFFDF8;border:1px solid rgba(33,30,26,0.2);border-radius:7px;box-shadow:0 30px 80px rgba(33,30,26,0.38);display:flex;flex-direction:column;overflow:hidden;transform:translateY(12px) scale(.99);transition:transform .22s cubic-bezier(.2,.7,.3,1);}",
      ".sdn-ov.in .sdn-panel{transform:none;}",
      ".sdn-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:11px 16px 11px 22px;border-bottom:1px solid rgba(33,30,26,0.1);flex:none;}",
      ".sdn-htitle{display:flex;align-items:baseline;gap:11px;min-width:0;}",
      ".sdn-kick{font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:var(--sdn-ox);flex:none;}",
      ".sdn-fname{font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;color:#211E1A;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.005em;}",
      ".sdn-tools{display:flex;align-items:center;gap:7px;flex:none;}",
      ".sdn-seg{display:flex;align-items:center;border:1px solid rgba(33,30,26,0.16);border-radius:4px;overflow:hidden;background:#FCFAF4;}",
      ".sdn-ico{width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:rgba(33,30,26,0.6);font-size:14px;cursor:pointer;transition:background .12s,color .12s;padding:0;line-height:1;}",
      ".sdn-ico:hover{background:rgba(33,30,26,0.06);color:var(--sdn-ox);}",
      ".sdn-ico.on{background:var(--sdn-ox);color:#FFFDF8;}",
      ".sdn-zpct{font-size:10.5px;color:rgba(33,30,26,0.55);min-width:44px;text-align:center;letter-spacing:.03em;}",
      ".sdn-search{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#211E1A;background:#FCFAF4;border:1px solid rgba(33,30,26,0.16);border-radius:4px;padding:7px 10px;outline:none;width:150px;transition:border-color .12s,width .16s ease;}",
      ".sdn-search:focus{border-color:var(--sdn-ox);width:184px;}",
      ".sdn-x{width:30px;height:30px;border:1px solid rgba(33,30,26,0.16);border-radius:4px;background:transparent;color:rgba(33,30,26,0.5);font-size:14px;cursor:pointer;line-height:1;}",
      ".sdn-x:hover{color:#211E1A;border-color:rgba(33,30,26,0.4);}",
      ".sdn-row{flex:1;min-height:0;display:flex;}",
      ".sdn-side{width:256px;flex:none;border-right:1px solid rgba(33,30,26,0.1);overflow:auto;background:#FAF8F3;transition:width .2s ease;}",
      ".sdn-side.hidden{width:0;overflow:hidden;border-right:none;}",
      ".sdn-sec{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(33,30,26,0.4);padding:16px 16px 8px;}",
      ".sdn-out{display:block;width:100%;text-align:left;font-size:11px;line-height:1.4;color:#211E1A;background:transparent;border:none;padding:5px 16px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".sdn-out:hover{background:rgba(33,30,26,0.05);color:var(--sdn-ox);}",
      ".sdn-hlrow{position:relative;padding:10px 12px 11px 20px;border-bottom:1px solid rgba(33,30,26,0.06);}",
      ".sdn-hlrow::before{content:'';position:absolute;left:10px;top:12px;bottom:12px;width:3px;border-radius:2px;background:var(--rowc,#C9A227);}",
      ".sdn-hltext{width:100%;text-align:left;font-family:'IBM Plex Serif',Georgia,serif;font-size:12px;line-height:1.5;color:#211E1A;background:transparent;border:none;cursor:pointer;padding:0;display:block;padding-right:14px;}",
      ".sdn-hltext:hover{color:var(--sdn-ox);}",
      ".sdn-hldel{position:absolute;top:8px;right:9px;font-size:11px;color:rgba(33,30,26,0.3);background:none;border:none;cursor:pointer;opacity:0;transition:opacity .12s;padding:0 2px;}",
      ".sdn-hlrow:hover .sdn-hldel{opacity:1;}",
      ".sdn-hlc{width:100%;margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:rgba(33,30,26,0.72);background:transparent;border:none;border-bottom:1px dashed rgba(33,30,26,0.16);outline:none;padding:2px 0;}",
      ".sdn-hlc:focus{border-bottom-color:var(--sdn-ox);}",
      ".sdn-gen{display:block;width:calc(100% - 28px);margin:6px 14px 16px;text-align:left;font-size:10.5px;letter-spacing:.03em;color:var(--sdn-ox);background:transparent;border:1px solid rgba(122,31,43,0.3);border-radius:3px;padding:9px 11px;cursor:pointer;transition:background .12s;}",
      ".sdn-gen:hover{background:rgba(122,31,43,0.06);}",
      ".sdn-empty{font-size:10.5px;line-height:1.6;color:rgba(33,30,26,0.42);padding:2px 16px 16px;}",
      ".sdn-reading{flex:1;min-height:0;overflow:auto;background:#E7E2D9;padding:26px 30px 48px;display:flex;flex-direction:column;align-items:center;gap:22px;position:relative;}",
      ".sdn-page{position:relative;background:#fff;border:1px solid rgba(33,30,26,0.1);border-radius:2px;box-shadow:0 1px 2px rgba(33,30,26,0.14),0 12px 34px rgba(33,30,26,0.12);flex:none;opacity:0;transition:opacity .3s ease;}",
      ".sdn-page.in{opacity:1;}",
      ".sdn-load{position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;color:rgba(33,30,26,0.5);font-size:11px;letter-spacing:.14em;text-transform:uppercase;}",
      ".sdn-loadbar{width:120px;height:2px;background:rgba(33,30,26,0.12);overflow:hidden;position:relative;}",
      ".sdn-loadbar::after{content:'';position:absolute;left:0;top:0;height:2px;width:40%;background:var(--sdn-ox);animation:ox-sweep 1.3s ease-in-out infinite;}",
      ".sdn-pageind{position:absolute;left:50%;transform:translateX(-50%);background:rgba(33,30,26,0.86);color:#FAF8F3;font-size:11px;letter-spacing:.1em;padding:5px 13px;border-radius:20px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:6;}",
      ".sdn-pageind.show{opacity:1;}",
      ".sdn-foot{flex:none;border-top:1px solid rgba(33,30,26,0.1);background:#FFFDF8;}",
      ".sdn-ans{display:none;padding:16px 24px;max-height:220px;overflow:auto;border-bottom:1px solid rgba(33,30,26,0.08);}",
      ".sdn-ans .q{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.03em;color:rgba(33,30,26,0.5);margin-bottom:8px;}",
      ".sdn-ans .a{font-family:'IBM Plex Serif',Georgia,serif;font-size:14.5px;line-height:1.66;color:#211E1A;}",
      ".sdn-assist{display:flex;gap:9px;align-items:center;padding:12px 24px;}",
      ".sdn-chip{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:rgba(33,30,26,0.62);background:#FCFAF4;border:1px solid rgba(33,30,26,0.18);border-radius:20px;padding:8px 13px;cursor:pointer;white-space:nowrap;transition:color .12s,border-color .12s;}",
      ".sdn-chip:hover{color:var(--sdn-ox);border-color:var(--sdn-ox);}",
      ".sdn-askin{flex:1;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#211E1A;background:#FCFAF4;border:1px solid rgba(33,30,26,0.2);border-radius:4px;padding:11px 13px;outline:none;}",
      ".sdn-askin:focus{border-color:var(--sdn-ox);}",
      ".sdn-send{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#FFFDF8;background:var(--sdn-ox);border:none;border-radius:4px;padding:11px 18px;cursor:pointer;transition:filter .12s;}",
      ".sdn-send:hover{filter:brightness(0.9);}",
      ".sdn-note{margin-top:10px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(33,30,26,0.55);background:transparent;border:1px solid rgba(33,30,26,0.2);border-radius:3px;padding:6px 10px;cursor:pointer;}",
      ".sdn-note:hover{color:var(--sdn-ox);border-color:var(--sdn-ox);}",
      ".sdn-missing{margin:auto;max-width:440px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px;color:rgba(33,30,26,0.6);font-size:12px;line-height:1.7;}",
      ".sdn-reattach{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#FFFDF8;background:var(--sdn-ox);border:none;border-radius:3px;padding:11px 18px;cursor:pointer;}",
      ".sdn-tl{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;line-height:1;}",
      ".sdn-tl span,.sdn-tl br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;}",
      ".sdn-tl span::selection{background:rgba(122,31,43,0.28);}",
      ".sdn-pdf-scroll::-webkit-scrollbar{width:11px;height:11px;}",
      ".sdn-pdf-scroll::-webkit-scrollbar-thumb{background:rgba(33,30,26,0.22);border-radius:6px;border:3px solid transparent;background-clip:content-box;}",
      ".sdn-pdf-scroll::-webkit-scrollbar-track{background:transparent;}",
    ].join('');
    document.head.appendChild(s);
  }
  openPdf = async (id) => {
    const n = this.byId()[id]; if (!n) return;
    if (this.pdfEl) this.closePdf();
    this.pdfNodeId = id;
    this.userZoom = 1;
    this.setState({ pdfView: { id } });           // marker so Escape closes it
    const blob = await this.idbGet(id);
    this.buildPdfOverlay(n, blob);
  };
  closePdf = () => {
    this.hidePdfToolbar();
    if (this.pdfEl) { try { this.pdfEl.remove(); } catch (e) {} this.pdfEl = null; }
    this.pdfNodeId = null;
    if (this.state.pdfView) this.setState({ pdfView: null });
  };
  PDF_HL_COLORS = [{ c: '#C9A227', name: 'amarelo' }, { c: '#3A6EA5', name: 'azul' }, { c: '#5E8C61', name: 'verde' }, { c: '#B5546A', name: 'rosa' }];
  buildPdfOverlay(node, blob) {
    this.injectPdfCss();
    const accent = this.curAccent();
    this.pageWraps = {}; this.pdfDoc = null; this.pdfOutline = null; this.pdfDocNode = node;
    const el = (tag, cls, css) => { const d = document.createElement(tag); if (cls) d.className = cls; if (css) d.style.cssText = css; return d; };
    const ov = el('div', 'sdn-ov'); ov.style.zIndex = '100'; ov.style.setProperty('--sdn-ox', accent);
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) this.closePdf(); });
    const panel = el('div', 'sdn-panel');
    // header — title + a tidy, grouped toolbar (icons with tooltips)
    const head = el('div', 'sdn-head');
    const title = el('div', 'sdn-htitle'); title.innerHTML = '<span class="sdn-kick">PDF</span><span class="sdn-fname">' + this.esc(node.filename || 'documento.pdf') + '</span>';
    head.appendChild(title);
    const tools = el('div', 'sdn-tools');
    const ico = (glyph, tip, fn) => { const b = el('button', 'sdn-ico'); b.textContent = glyph; b.title = tip; b.onclick = fn; return b; };
    if (blob) {
      const find = el('input', 'sdn-search'); find.placeholder = 'buscar no PDF';
      find.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.searchPdf(find.value); } };
      tools.appendChild(find);
      const zseg = el('div', 'sdn-seg');
      zseg.appendChild(ico('−', 'Diminuir zoom', () => this.zoomPdf(1 / 1.15)));
      this.pdfZpct = el('span', 'sdn-zpct'); this.pdfZpct.textContent = '100%'; zseg.appendChild(this.pdfZpct);
      zseg.appendChild(ico('+', 'Aumentar zoom', () => this.zoomPdf(1.15)));
      tools.appendChild(zseg);
      this.pdfCropBtn = ico('▢', 'Recortar região (figura → imagem)', () => this.toggleCrop(this.pdfCropBtn)); tools.appendChild(this.pdfCropBtn);
    }
    tools.appendChild(ico('↧', 'Exportar destaques como nota', () => this.exportHighlights(this.pdfDocNode)));
    tools.appendChild(ico('☰', 'Mostrar/ocultar painel', () => { if (this.pdfSide) this.pdfSide.classList.toggle('hidden'); }));
    if (blob) tools.appendChild(ico('↓', 'Baixar o PDF', () => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = node.filename || 'documento.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }));
    const close = el('button', 'sdn-x'); close.textContent = '✕'; close.title = 'Fechar (Esc)'; close.onclick = () => this.closePdf(); tools.appendChild(close);
    head.appendChild(tools); panel.appendChild(head);
    // content row: sidebar + reading area
    const row = el('div', 'sdn-row');
    const side = el('div', 'sdn-side sdn-pdf-scroll');
    const body = el('div', 'sdn-reading sdn-pdf-scroll');
    const pind = el('div', 'sdn-pageind');
    body.appendChild(pind);
    row.appendChild(side); row.appendChild(body); panel.appendChild(row);
    // footer — "Assistente do PDF": quick actions + grounded Q&A
    const foot = el('div', 'sdn-foot');
    const ans = el('div', 'sdn-ans'); foot.appendChild(ans);
    const assist = el('div', 'sdn-assist');
    if (blob) {
      const c1 = el('button', 'sdn-chip'); c1.textContent = '✦ Resumir'; c1.onclick = () => this.askPdf(this.pdfDocNode, 'Resuma este documento em tópicos curtos e liste os termos-chave.', this.pdfAns); assist.appendChild(c1);
      const c2 = el('button', 'sdn-chip'); c2.textContent = '👁 Visão'; c2.title = 'Ler as páginas com visão (para PDF escaneado)'; c2.onclick = () => this.askPdfVision(this.pdfDocNode, this.pdfAns); assist.appendChild(c2);
    }
    const inp = el('input', 'sdn-askin'); inp.placeholder = 'Pergunte ao PDF…';
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.askPdf(node, inp.value, ans); inp.value = ''; } };
    const sendB = el('button', 'sdn-send'); sendB.textContent = 'Perguntar'; sendB.onclick = () => { this.askPdf(node, inp.value, ans); inp.value = ''; };
    assist.appendChild(inp); assist.appendChild(sendB); foot.appendChild(assist); panel.appendChild(foot);
    ov.appendChild(panel); document.body.appendChild(ov);
    this.pdfEl = ov; this.pdfBody = body; this.pdfSide = side; this.pdfAns = ans; this._pdfBlob = blob; this.pdfPageInd = pind;
    requestAnimationFrame(() => ov.classList.add('in'));   // fade + rise entrance
    this.renderHlPanel(node);
    if (!blob) {
      const box = el('div', 'sdn-missing');
      box.innerHTML = '<div>O arquivo não está neste dispositivo (o PDF fica salvo localmente). Os destaques e o texto estão preservados — re-anexe o mesmo PDF para vê-lo de novo.</div>';
      const fi = el('input'); fi.type = 'file'; fi.accept = 'application/pdf,.pdf'; fi.style.display = 'none';
      fi.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) this.reattachPdf(node.id, f); };
      const btn = el('button', 'sdn-reattach'); btn.textContent = '↥ re-anexar este PDF'; btn.onclick = () => fi.click();
      box.appendChild(btn); box.appendChild(fi); body.appendChild(box); return;
    }
    const load = el('div', 'sdn-load'); load.innerHTML = '<div class="sdn-loadbar"></div><span>abrindo documento…</span>'; body.appendChild(load); this.pdfLoad = load;
    body.addEventListener('mouseup', () => setTimeout(() => this.onPdfSelect(node), 0));
    body.addEventListener('pointerdown', this.onCropDown);
    body.addEventListener('scroll', this.onPdfScroll);
    this.pdfCropMode = false;
    this.renderPdfPages(body, blob, node).then(() => this.renderHlPanel(node)).catch(() => { body.innerHTML = '<div class="sdn-missing"><div>Falha ao renderizar o PDF.</div></div>'; });
  }
  onPdfScroll = () => {
    if (!this.pdfBody || !this.pdfPageInd) return;
    const b = this.pdfBody; const mid = b.scrollTop + b.clientHeight / 2;
    let cur = 1; Object.keys(this.pageWraps).forEach(p => { if (this.pageWraps[p].offsetTop <= mid) cur = Number(p); });
    const total = this.pdfDoc ? this.pdfDoc.numPages : Object.keys(this.pageWraps).length;
    this.pdfPageInd.textContent = cur + ' / ' + total;
    this.pdfPageInd.style.top = (b.scrollTop + b.clientHeight - 46) + 'px';
    this.pdfPageInd.classList.add('show');
    clearTimeout(this._pind); this._pind = setTimeout(() => { if (this.pdfPageInd) this.pdfPageInd.classList.remove('show'); }, 1100);
  };
  // ---- region crop: drag a rectangle over a page → crop the canvas into an image node ----
  toggleCrop(btn) {
    this.pdfCropMode = !this.pdfCropMode;
    if (btn) btn.classList.toggle('on', this.pdfCropMode);
    if (this.pdfBody) { this.pdfBody.style.cursor = this.pdfCropMode ? 'crosshair' : ''; [...this.pdfBody.querySelectorAll('.sdn-tl')].forEach(t => t.style.pointerEvents = this.pdfCropMode ? 'none' : ''); }
    this.toast(this.pdfCropMode ? 'Recorte ligado — arraste sobre a figura' : 'Recorte desligado');
  }
  onCropDown = (e) => {
    if (!this.pdfCropMode || e.button !== 0) return;
    let wrap = e.target; while (wrap && !(wrap.dataset && wrap.dataset.page)) wrap = wrap.parentElement;
    if (!wrap) return;
    e.preventDefault();
    this._crop = { wrap, x0: e.clientX, y0: e.clientY, r: wrap.getBoundingClientRect() };
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;z-index:102;border:1.5px dashed ' + this.curAccent() + ';background:rgba(122,31,43,0.14);pointer-events:none;'; document.body.appendChild(box); this._cropBox = box;
    this.updateCropBox(e);
    window.addEventListener('pointermove', this.onCropMove);
    window.addEventListener('pointerup', this.onCropUp);
  };
  onCropMove = (e) => { if (this._crop) this.updateCropBox(e); };
  updateCropBox(e) { const c = this._crop; if (!c || !this._cropBox) return; const x = Math.min(c.x0, e.clientX), y = Math.min(c.y0, e.clientY), w = Math.abs(e.clientX - c.x0), h = Math.abs(e.clientY - c.y0); this._cropBox.style.left = x + 'px'; this._cropBox.style.top = y + 'px'; this._cropBox.style.width = w + 'px'; this._cropBox.style.height = h + 'px'; }
  onCropUp = (e) => {
    window.removeEventListener('pointermove', this.onCropMove); window.removeEventListener('pointerup', this.onCropUp);
    const c = this._crop; this._crop = null; if (this._cropBox) { this._cropBox.remove(); this._cropBox = null; }
    if (!c) return;
    const x = Math.min(c.x0, e.clientX), y = Math.min(c.y0, e.clientY), w = Math.abs(e.clientX - c.x0), h = Math.abs(e.clientY - c.y0);
    if (w < 8 || h < 8) return;
    this.cropToImage(c.wrap, x - c.r.left, y - c.r.top, w, h);
  };
  cropToImage(wrap, x, y, w, h) {
    const canvas = wrap.querySelector('canvas'); if (!canvas) return;
    const ratio = canvas.width / (wrap.clientWidth || canvas.width);
    const sx = Math.max(0, x * ratio), sy = Math.max(0, y * ratio), sw = Math.min(canvas.width - sx, w * ratio), sh = Math.min(canvas.height - sy, h * ratio);
    if (sw < 2 || sh < 2) return;
    const c = document.createElement('canvas'); c.width = Math.round(sw); c.height = Math.round(sh);
    c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, Math.round(sw), Math.round(sh));
    const ts = Math.min(1, 360 / Math.max(c.width, c.height));
    const tc = document.createElement('canvas'); tc.width = Math.round(c.width * ts); tc.height = Math.round(c.height * ts); tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
    const thumb = tc.toDataURL('image/jpeg', 0.82);
    c.toBlob((blob) => { const id = 'n' + (++this.nidc); if (blob) this.idbPut(id, blob).catch(() => {}); this.createImage(id, thumb, c.width, c.height, 'Recorte do PDF'); this.toast('Figura recortada → nó de imagem'); }, 'image/jpeg', 0.85);
  }
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  async renderPdfPages(body, blob, node) {
    const lib = await this.loadPdfJs();
    const data = new Uint8Array(await blob.arrayBuffer());
    const pdf = await lib.getDocument({ data }).promise;
    this.pdfDoc = pdf;
    try { this.pdfOutline = await this.resolveOutline(pdf); } catch (e) { this.pdfOutline = null; }
    const total = Math.min(pdf.numPages, 60);
    const maxW = Math.min(960, (body.clientWidth || 800) - 8);
    for (let p = 1; p <= total; p++) {
      if (this.pdfBody !== body) return; // viewer was closed
      const page = await pdf.getPage(p);
      const v0 = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxW / v0.width) * (this.userZoom || 1);
      const vp = page.getViewport({ scale });
      const wrap = document.createElement('div');
      wrap.className = 'sdn-page';
      wrap.style.width = Math.round(vp.width) + 'px'; wrap.style.height = Math.round(vp.height) + 'px';
      wrap.dataset.page = String(p);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      canvas.style.cssText = 'display:block;width:100%;height:100%;';
      wrap.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const tl = document.createElement('div'); tl.className = 'sdn-tl'; tl.style.width = Math.round(vp.width) + 'px'; tl.style.height = Math.round(vp.height) + 'px';
      wrap.appendChild(tl);
      try { const tc = await page.getTextContent(); await lib.renderTextLayer({ textContent: tc, container: tl, viewport: vp, textDivs: [] }).promise; } catch (e) {}
      if (this.pdfLoad) { try { this.pdfLoad.remove(); } catch (e) {} this.pdfLoad = null; }
      body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('in'));   // gentle fade-in per page
      this.pageWraps[p] = wrap;
      this.paintHighlights(wrap, p, this.byId()[node.id] || node);
      this.paintBacklinks(wrap, p, node.id);
      if (this._pdfGoto && p === this._pdfGoto) { const tgt = this._pdfGoto; this._pdfGoto = null; setTimeout(() => this.scrollToHlPage(tgt), 60); }
    }
  }
  async resolveOutline(pdf) {
    const raw = await pdf.getOutline();
    if (!raw || !raw.length) return null;
    const out = [];
    for (const it of raw.slice(0, 40)) {
      let page = null;
      try { let dest = it.dest; if (typeof dest === 'string') dest = await pdf.getDestination(dest); if (Array.isArray(dest) && dest[0]) page = (await pdf.getPageIndex(dest[0])) + 1; } catch (e) {}
      out.push({ title: it.title || '—', page });
    }
    return out;
  }
  onPdfSelect(node) {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || !this.pdfEl || !sel.rangeCount || !this.pdfEl.contains(sel.anchorNode)) { this.hidePdfToolbar(); return; }
    let wrap = sel.anchorNode; while (wrap && !(wrap.dataset && wrap.dataset.page)) wrap = wrap.parentElement;
    const page = wrap ? Number(wrap.dataset.page) : 1;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    this.showPdfToolbar(rect, text, node, page);
  }
  showPdfToolbar(rect, text, node, page) {
    this.hidePdfToolbar();
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;z-index:101;left:' + Math.round(rect.left + rect.width / 2) + 'px;top:' + Math.round(rect.top - 48) + 'px;transform:translateX(-50%) scale(.96);opacity:0;transition:opacity .12s ease,transform .12s cubic-bezier(.2,.7,.3,1);display:flex;align-items:center;gap:1px;background:#211E1A;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.32);padding:3px 5px;font-family:"IBM Plex Mono",monospace;';
    const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font-size:10.5px;letter-spacing:.05em;color:#FAF8F3;background:transparent;border:none;border-radius:4px;padding:7px 11px;cursor:pointer;transition:background .1s;'; b.onmouseenter = () => b.style.background = 'rgba(250,248,243,0.14)'; b.onmouseleave = () => b.style.background = 'transparent'; b.onmousedown = (e) => e.preventDefault(); b.onclick = fn; return b; };
    bar.appendChild(mk('✚ Nota', () => { this.createNoteFromPdf(text, node, page); this.hidePdfToolbar(); }));
    bar.appendChild(mk('✦ IA', () => { this.generateFromPdf(text, node, page); this.hidePdfToolbar(); }));
    const sep = document.createElement('span'); sep.style.cssText = 'width:1px;height:18px;background:rgba(250,248,243,0.18);margin:0 4px;'; bar.appendChild(sep);
    this.PDF_HL_COLORS.forEach(col => { const d = document.createElement('button'); d.title = 'Destacar ' + col.name; d.style.cssText = 'width:15px;height:15px;border-radius:50%;border:1px solid rgba(250,248,243,0.35);background:' + col.c + ';margin:0 2px;cursor:pointer;padding:0;transition:transform .1s;'; d.onmouseenter = () => d.style.transform = 'scale(1.18)'; d.onmouseleave = () => d.style.transform = 'scale(1)'; d.onmousedown = (e) => e.preventDefault(); d.onclick = () => { this.highlightSelection(node, col.c); this.hidePdfToolbar(); }; bar.appendChild(d); });
    const caret = document.createElement('span'); caret.style.cssText = 'position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);width:10px;height:10px;background:#211E1A;border-bottom-right-radius:2px;clip-path:polygon(100% 0,0 100%,100% 100%);rotate:45deg;'; bar.appendChild(caret);
    document.body.appendChild(bar); this.pdfBar = bar;
    requestAnimationFrame(() => { bar.style.opacity = '1'; bar.style.transform = 'translateX(-50%) scale(1)'; });
  }
  hidePdfToolbar() { if (this.pdfBar) { try { this.pdfBar.remove(); } catch (e) {} this.pdfBar = null; } }
  createNoteFromPdf(text, node, page) {
    const fname = (node.filename || 'PDF').replace(/\.pdf$/i, '').slice(0, 22);
    const id = this.createNote('Do PDF · ' + fname, text, 'pdf-sel');
    if (id) this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, pdfSource: { id: node.id, page: page || 1 } } : n) });
    if (this.pageWraps && this.pageWraps[page || 1]) this.paintBacklinks(this.pageWraps[page || 1], page || 1, node.id);
    this.toast('Nota criada a partir da seleção — conecte (●) a um nó de IA');
  }
  // margin badge: how many notes/generators link back to this page
  paintBacklinks(wrap, page, pdfId) {
    [...wrap.querySelectorAll('.sdn-bl')].forEach(e => e.remove());
    const refs = this.state.nodes.filter(n => n.pdfSource && n.pdfSource.id === pdfId && n.pdfSource.page === page);
    if (!refs.length) return;
    const badge = document.createElement('button'); badge.className = 'sdn-bl'; badge.textContent = '◉ ' + refs.length;
    badge.title = refs.length + ' nó(s) referenciam esta página';
    badge.style.cssText = 'position:absolute;top:8px;right:-13px;z-index:4;font-family:"IBM Plex Mono",monospace;font-size:10px;color:#FFFDF8;background:' + this.curAccent() + ';border:none;border-radius:10px;padding:3px 8px;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,0.35);';
    badge.onclick = () => { const first = refs[0]; this.closePdf(); setTimeout(() => { this.setState({ selectedId: first.id }); if (this.frameSelection) this.frameSelection(); }, 90); };
    wrap.appendChild(badge);
  }
  openPdfAt = (id, page) => { this._pdfGoto = page || 1; this.openPdf(id); };
  reattachPdf(id, file) {
    this.toast('Re-anexando…');
    this.idbPut(id, file).then(() => {
      this.processPdf(file).then((r) => { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, content: r.text || n.content, thumb: r.thumb || n.thumb, pages: r.pages || n.pages } : n) }); }).catch(() => {});
      this.toast('PDF re-anexado');
      this.closePdf(); setTimeout(() => this.openPdf(id), 80);
    }).catch(() => this.toast('Falha ao re-anexar'));
  }
  zoomPdf(f) {
    this.userZoom = Math.max(0.6, Math.min(2.6, (this.userZoom || 1) * f));
    if (this.pdfZpct) this.pdfZpct.textContent = Math.round((this.userZoom || 1) * 100) + '%';
    if (this.pdfBody && this._pdfBlob) {
      const b = this.pdfBody; const ratio = b.scrollHeight ? (b.scrollTop / b.scrollHeight) : 0;
      this.pageWraps = {}; b.innerHTML = '';
      if (this.pdfPageInd) b.appendChild(this.pdfPageInd);
      this.renderPdfPages(b, this._pdfBlob, this.pdfDocNode).then(() => { try { b.scrollTop = ratio * b.scrollHeight; } catch (e) {} }).catch(() => {});
    }
  }
  searchPdf(query) {
    query = (query || '').trim().toLowerCase(); if (!query || !this.pdfBody) return;
    [...this.pdfBody.querySelectorAll('.sdn-find')].forEach(e => { e.style.background = ''; e.classList.remove('sdn-find'); });
    const spans = [...this.pdfBody.querySelectorAll('.sdn-tl span')].filter(s => (s.textContent || '').toLowerCase().includes(query));
    if (!spans.length) { this.toast('Nada encontrado no PDF'); return; }
    spans.forEach(s => { s.classList.add('sdn-find'); s.style.background = 'rgba(201,162,39,0.55)'; });
    spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.toast(spans.length + ' ocorrência(s)');
  }
  // persist a colored highlight (page + normalized rects + text + comment) on the node
  highlightSelection(node, color) {
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
    const text = sel.toString().trim(); if (!text) return;
    const range = sel.getRangeAt(0);
    let wrap = range.startContainer; while (wrap && !(wrap.dataset && wrap.dataset.page)) wrap = wrap.parentElement;
    const page = wrap ? Number(wrap.dataset.page) : 1;
    const rects = [];
    if (wrap) { const pr = wrap.getBoundingClientRect(); [...range.getClientRects()].forEach(r => { if (r.width > 1 && r.height > 1) rects.push({ x: (r.left - pr.left) / pr.width, y: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height }); }); }
    const hl = { id: 'h' + (++this.cid), page, text, rects, color: color || this.PDF_HL_COLORS[0].c, comment: '' };
    const list = ((this.byId()[node.id] || node).highlights || []).concat([hl]);
    this.setState({ nodes: this.state.nodes.map(n => n.id === node.id ? { ...n, highlights: list } : n) });
    if (wrap) this.paintHighlights(wrap, page, this.byId()[node.id]);
    this.renderHlPanel(this.byId()[node.id]);
    sel.removeAllRanges();
    this.toast('Trecho destacado');
  }
  updateHl(nodeId, hid, patch) {
    this.setState({ nodes: this.state.nodes.map(n => n.id === nodeId ? { ...n, highlights: (n.highlights || []).map(h => h.id === hid ? { ...h, ...patch } : h) } : n) });
    const node = this.byId()[nodeId];
    const hl = (node.highlights || []).find(h => h.id === hid);
    if (hl && this.pageWraps && this.pageWraps[hl.page]) this.paintHighlights(this.pageWraps[hl.page], hl.page, node);
    this.renderHlPanel(node);
  }
  deleteHl(nodeId, hid) {
    const node0 = this.byId()[nodeId]; const hl = (node0.highlights || []).find(h => h.id === hid); const pg = hl && hl.page;
    this.setState({ nodes: this.state.nodes.map(n => n.id === nodeId ? { ...n, highlights: (n.highlights || []).filter(h => h.id !== hid) } : n) });
    const node = this.byId()[nodeId];
    if (pg && this.pageWraps && this.pageWraps[pg]) this.paintHighlights(this.pageWraps[pg], pg, node);
    this.renderHlPanel(node);
  }
  paintHighlights(wrap, page, node) {
    [...wrap.querySelectorAll('.sdn-hl')].forEach(e => e.remove());
    (node && node.highlights || []).filter(h => h.page === page).forEach(h => (h.rects || []).forEach(r => {
      const d = document.createElement('div'); d.className = 'sdn-hl';
      d.style.cssText = 'position:absolute;pointer-events:none;left:' + (r.x * 100) + '%;top:' + (r.y * 100) + '%;width:' + (r.w * 100) + '%;height:' + (r.h * 100) + '%;background:' + (h.color || '#C9A227') + ';opacity:0.34;border-radius:1px;mix-blend-mode:multiply;';
      wrap.appendChild(d);
    }));
  }
  scrollToHlPage(page) { const w = this.pageWraps && this.pageWraps[page]; if (w) { w.scrollIntoView({ behavior: 'smooth', block: 'center' }); w.style.outline = '3px solid ' + this.curAccent(); setTimeout(() => { try { w.style.outline = 'none'; } catch (e) {} }, 900); } }
  // (re)build the left sidebar: outline + highlight list with color, comment, delete
  renderHlPanel(node) {
    const side = this.pdfSide; if (!side) return;
    node = this.byId()[this.pdfNodeId] || node || {};
    side.innerHTML = '';
    const sec = (title) => { const h = document.createElement('div'); h.className = 'sdn-sec'; h.textContent = title; return h; };
    if (this.pdfOutline && this.pdfOutline.length) {
      side.appendChild(sec('Sumário'));
      this.pdfOutline.forEach(o => { const a = document.createElement('button'); a.className = 'sdn-out'; a.textContent = o.title; a.onclick = () => { if (o.page) this.scrollToHlPage(o.page); }; side.appendChild(a); });
    }
    const hls = node.highlights || [];
    side.appendChild(sec('Destaques (' + hls.length + ')'));
    if (!hls.length) { const e = document.createElement('div'); e.className = 'sdn-empty'; e.textContent = 'Selecione um trecho no PDF e escolha uma cor para destacá-lo.'; side.appendChild(e); }
    if (hls.length) { const g = document.createElement('button'); g.className = 'sdn-gen'; g.textContent = '↳ gerar questões destes destaques'; g.onclick = () => this.generateFromHighlights(node); side.appendChild(g); }
    hls.forEach(h => {
      const row = document.createElement('div'); row.className = 'sdn-hlrow'; row.style.setProperty('--rowc', h.color || '#C9A227');
      const snip = document.createElement('button'); snip.className = 'sdn-hltext'; snip.textContent = (h.text || '').slice(0, 90); snip.title = 'Ir para a página ' + h.page; snip.onclick = () => this.scrollToHlPage(h.page);
      const del = document.createElement('button'); del.className = 'sdn-hldel'; del.textContent = '✕'; del.title = 'Remover'; del.onclick = () => this.deleteHl(node.id, h.id);
      row.appendChild(snip); row.appendChild(del);
      const ci = document.createElement('input'); ci.className = 'sdn-hlc'; ci.value = h.comment || ''; ci.placeholder = 'comentário…'; ci.oninput = (e) => this.updateHlComment(node.id, h.id, e.target.value);
      row.appendChild(ci); side.appendChild(row);
    });
  }
  // comment edits must not re-render the panel (would lose input focus); just persist
  updateHlComment(nodeId, hid, text) { this.setState({ nodes: this.state.nodes.map(n => n.id === nodeId ? { ...n, highlights: (n.highlights || []).map(h => h.id === hid ? { ...h, comment: text } : h) } : n) }); }
  exportHighlights(node) {
    node = this.byId()[(node && node.id) || this.pdfNodeId];
    const hls = (node && node.highlights) || [];
    if (!hls.length) { this.toast('Nenhum destaque para exportar'); return; }
    const md = '# Destaques — ' + (node.filename || 'PDF') + '\n\n' + hls.map(h => '- (p. ' + h.page + ') ' + h.text + (h.comment ? ('\n  > ' + h.comment) : '')).join('\n');
    this.createNote('Destaques · ' + (node.filename || 'PDF').replace(/\.pdf$/i, '').slice(0, 20), md, 'pdf-hl');
    this.toast('Destaques exportados como nota');
  }
  // selection → a note with the text + a connected empty generator, opened for a prompt
  generateFromPdf(text, node, page) {
    const fname = (node.filename || 'PDF').replace(/\.pdf$/i, '').slice(0, 22);
    const noteId = this.createNote('Do PDF · ' + fname, text, 'pdf-sel');
    if (noteId) this.setState({ nodes: this.state.nodes.map(n => n.id === noteId ? { ...n, pdfSource: { id: node.id, page: page || 1 } } : n) });
    this.closePdf();
    setTimeout(() => {
      const gid = this.addNode();
      if (gid && noteId) this.addConn(noteId, gid);
      setTimeout(() => { if (gid) this.openPopover(gid); }, 60);
      this.toast('Trecho pronto — descreva as questões e gere');
    }, 80);
  }
  // gather every highlight and generate questions from them
  generateFromHighlights(node) {
    const hls = (this.byId()[node.id] || node).highlights || [];
    if (!hls.length) { this.toast('Destaque algo primeiro'); return; }
    const text = hls.map(h => '• ' + h.text + (h.comment ? (' — ' + h.comment) : '')).join('\n');
    this.generateFromPdf(text, node);
  }
  // convert text with $...$ / $$...$$ to safe HTML (KaTeX where possible)
  textToHtml(text) {
    return this.splitMath(text || '').map(tk => {
      if (tk.math) { const h = this.mathToHtml(tk.value, tk.display); return h || (tk.display ? '$$' : '$') + this.esc(tk.value) + (tk.display ? '$$' : '$'); }
      return this.esc(tk.value).replace(/\n/g, '<br>');
    }).join('');
  }
  // render the open PDF's first pages to JPEG data URLs (for vision on scanned PDFs)
  async pdfPageImages(max) {
    const pdf = this.pdfDoc; if (!pdf) return [];
    const out = []; const n = Math.min(pdf.numPages, max || 4);
    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p);
      const v0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(1.6, 1100 / v0.width) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      out.push(c.toDataURL('image/jpeg', 0.7));
    }
    return out;
  }
  askPdfVision(node, ansEl) {
    ansEl = ansEl || this.pdfAns; if (!ansEl) return;
    ansEl.style.display = 'block'; ansEl.textContent = 'lendo as páginas com visão…';
    this.pdfPageImages(4).then(imgs => { if (!imgs.length) { ansEl.textContent = 'Não consegui renderizar as páginas.'; return; } this.askPdf(node, 'Transcreva e explique o conteúdo destas páginas em tópicos.', ansEl, imgs); }).catch(() => { ansEl.textContent = 'Falha ao ler as páginas.'; });
  }
  // grounded Q&A over the PDF's text and/or page images (vision)
  askPdf(node, question, ansEl, images) {
    question = (question || '').trim(); if (!question || !ansEl) return;
    const text = (this.byId()[node.id] || node).content || '';
    if (!text.trim() && !(images && images.length)) { this.toast('Sem texto — use 👁 visão para ler as páginas'); return; }
    ansEl.style.display = 'block'; if (ansEl.textContent.indexOf('visão') < 0) ansEl.textContent = 'pensando…';
    fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, filename: node.filename || 'PDF', context: text, images: images || [] }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ('erro ' + r.status)); return d; })
      .then((d) => {
        if (!this.pdfEl || !ansEl.isConnected) return;
        ansEl.innerHTML = '';
        const q = document.createElement('div'); q.className = 'q'; q.textContent = '“' + question + '”';
        const a = document.createElement('div'); a.className = 'a'; a.innerHTML = this.textToHtml(d.answer || '');
        const note = document.createElement('button'); note.className = 'sdn-note'; note.textContent = '✚ virar nota';
        note.onclick = () => { this.createNote('PDF · ' + question.slice(0, 28), 'Pergunta: ' + question + '\n\n' + (d.answer || ''), 'pdf-qa'); this.toast('Resposta virou nota'); };
        ansEl.appendChild(q); ansEl.appendChild(a); ansEl.appendChild(note);
      })
      .catch((err) => { if (ansEl.isConnected) ansEl.textContent = 'Falha: ' + ((err && err.message) || 'erro'); });
  }

  // ---------- image nodes (your own diagrams / prints) ----------
  pickImage = () => { if (this.imgInput) this.imgInput.click(); };
  setImgInput = (el) => { this.imgInput = el; };
  // Produce a full-res blob (≤1600px, kept in IndexedDB) + a tiny thumbnail data URL
  // (≤360px, lives in the node so localStorage/cloud stay small).
  downscaleImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const transparent = /png|gif|webp/i.test(file.type);
          const mime = transparent ? 'image/png' : 'image/jpeg';
          const draw = (max) => { let w = img.width, h = img.height; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); return { c, w, h }; };
          const full = draw(1600);
          const thumb = draw(360).c.toDataURL(mime, 0.8);
          full.c.toBlob((blob) => { URL.revokeObjectURL(url); resolve({ blob: blob || null, thumb, w: full.w, h: full.h }); }, mime, 0.85);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }
  async addImageFromFile(file, caption) {
    if (!file || !/^image\//.test(file.type)) { this.toast('Selecione um arquivo de imagem'); return; }
    if (this.state.screen !== 'canvas' || !this.vp) { this.toast('Abra um quadro para adicionar a imagem'); return; }
    this.toast('Processando imagem…');
    let data;
    try { data = await this.downscaleImage(file); } catch (e) { this.toast('Falha ao ler a imagem'); return; }
    const id = 'n' + (++this.nidc);
    if (data.blob) this.idbPut(id, data.blob).catch(() => {});   // full image stays local (IndexedDB)
    this.createImage(id, data.thumb, data.w, data.h, caption || (file.name || '').replace(/\.[a-z]+$/i, ''));
  }
  onImgPick = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    await this.addImageFromFile(file);
  };
  onPaste = (e) => {
    if (this.state.screen !== 'canvas') return;
    const t = e.target; if (t && /input|textarea/i.test(t.tagName)) return; // let inputs paste text
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        const file = items[i].getAsFile();
        if (file) { e.preventDefault(); this.addImageFromFile(file, 'Colado'); return; }
      }
    }
  };
  createImage(id, thumb, iw, ih, caption) {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 24;
    const wld = this.screenToWorld(r.left + r.width * 0.42 + j, r.top + r.height * 0.40 + j);
    const w = 300, h = Math.round(Math.max(140, Math.min(360, w * (ih / Math.max(1, iw)) + 38)));
    this.pushHist();
    const p = this.avoidOverlap(wld.x - w / 2, wld.y - h / 2, w, h);
    const node = { id, type: 'image', x: p.x, y: p.y, w, h, src: thumb, hasFile: true, caption: caption || '', shortLabel: (caption || 'Imagem').slice(0, 18) };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
    this.toast('Imagem adicionada');
    return id;
  }
  setImageCaption(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, caption: val, shortLabel: (val || 'Imagem').slice(0, 18) } : n) }); }
  // lightbox: show the thumbnail immediately, upgrade to the full image from IndexedDB
  openImg = async (id) => {
    const n = this.byId()[id]; if (!n) return;
    this.setState({ imgView: { id, caption: n.caption || '', url: n.src || '', full: false } });
    const blob = await this.idbGet(id);
    if (blob) { if (this._imgUrl) { try { URL.revokeObjectURL(this._imgUrl); } catch (e) {} } this._imgUrl = URL.createObjectURL(blob); this.setState({ imgView: { id, caption: n.caption || '', url: this._imgUrl, full: true } }); }
  };
  closeImg = () => { if (this._imgUrl) { try { URL.revokeObjectURL(this._imgUrl); } catch (e) {} this._imgUrl = null; } this.setState({ imgView: null }); };

  deleteNode(id) {
    const n = this.byId()[id];
    if (!n || n.locked) return;
    if (n.type === 'pdf' || n.type === 'image') this.idbDel(id);
    this.pushHist();
    const patch = {
      nodes: this.state.nodes.filter(x => x.id !== id),
      connections: this.state.connections.filter(c => c.from !== id && c.to !== id),
      selectedId: null, selectedConnId: null, popover: null,
    };
    if (this.state.gen && this.state.gen.nodeId === id) { this.clearGenTimers(); patch.gen = null; }
    this.setState(patch);
  }
  // rename the open discipline (via its editable title node)
  renameTitle(nodeId, val) {
    const name = val;
    this.setState({
      nodes: this.state.nodes.map(n => n.id === nodeId ? { ...n, titleBig: name, shortLabel: name } : n),
      disciplines: this.state.disciplines.map(d => d.id === this.state.activeDisc ? { ...d, name } : d),
    });
  }
  // delete a discipline and its whole board (works from canvas chrome or the shelf)
  deleteDiscById(id) {
    if (!id) return;
    const d = this.disc(id);
    if (typeof window !== 'undefined' && window.confirm && !window.confirm('Excluir a disciplina "' + (d ? d.name : '') + '" e todo o quadro? Isso não pode ser desfeito.')) return;
    const disciplines = this.state.disciplines.filter(x => x.id !== id);
    const boards = { ...this.state.boards };
    this.delBoardFiles(this.state.activeDisc === id ? { nodes: this.state.nodes } : boards[id]);
    delete boards[id];
    const patch = { disciplines, boards, discMenu: null, selectedId: null, selectedConnId: null, popover: null };
    if (this.state.activeDisc === id) {
      this.clearGenTimers(); this.resetHist();
      Object.assign(patch, { screen: 'biblioteca', activeDisc: null, nodes: [], connections: [], gen: null, reading: null });
    }
    this.setState(patch);
    this.toast('Disciplina excluída');
  }
  deleteDiscipline = () => this.deleteDiscById(this.state.activeDisc);

  // ---------- shelf: per-discipline menu (rename / delete from the library) ----------
  openDiscMenu(id) { this.setState({ discMenu: { id } }); }
  closeDiscMenu = () => this.setState({ discMenu: null });
  deleteFromMenu = () => { const m = this.state.discMenu; if (m) this.deleteDiscById(m.id); };
  openDiscFromMenu = () => { const m = this.state.discMenu; if (m) { this.setState({ discMenu: null }); this.openDiscipline(m.id); } };
  setDiscColor(id, color) { this.setState({ disciplines: this.state.disciplines.map(d => d.id === id ? { ...d, color } : d) }); }
  moveDisc(dir) {
    const m = this.state.discMenu; if (!m) return;
    const arr = this.state.disciplines.slice();
    const i = arr.findIndex(d => d.id === m.id); const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    this.setState({ disciplines: arr });
  }
  openRenameFromMenu = () => { const m = this.state.discMenu; if (!m) return; const d = this.disc(m.id); this.setState({ discMenu: null, renameDisc: { id: m.id, name: d ? d.name : '' } }); };
  closeRename = () => this.setState({ renameDisc: null });
  setRenameName = (e) => { const r = this.state.renameDisc; if (r) this.setState({ renameDisc: { ...r, name: e.target.value } }); };
  onRenameKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.commitRename(); } else if (e.key === 'Escape') this.closeRename(); };
  setRenameInput = (el) => { this.autoFocus(el, true); };
  commitRename = () => {
    const r = this.state.renameDisc; if (!r) return;
    const name = (r.name || '').trim() || 'Sem título';
    const renameTitleNode = (nodes) => nodes.map(n => n.type === 'title' ? { ...n, titleBig: name, shortLabel: name } : n);
    const boards = { ...this.state.boards };
    if (boards[r.id]) boards[r.id] = { ...boards[r.id], nodes: renameTitleNode(boards[r.id].nodes || []) };
    const patch = { disciplines: this.state.disciplines.map(d => d.id === r.id ? { ...d, name } : d), boards, renameDisc: null };
    if (this.state.screen === 'canvas' && this.state.activeDisc === r.id) patch.nodes = renameTitleNode(this.state.nodes);
    this.setState(patch);
    this.toast('Disciplina renomeada');
  };
  cornerAi = () => {
    const sel = this.state.selectedId;
    if (sel) {
      const n = this.byId()[sel];
      if (n && n.type === 'generated') this.openPopover(sel);
      else this.toast('selecione um nó de geração');
    } else this.toast('selecione um nó para gerar');
  };
  toast(msg) {
    this.setState({ toast: msg });
    clearTimeout(this.tt);
    this.tt = setTimeout(() => this.setState({ toast: null }), 2800);
  }

  // ---------- AI popover + generation ----------
  openPopover(id) { this.setState({ selectedId: id, popover: { nodeId: id, text: '', count: 5, level: 'médio' } }); }
  closePopover = () => this.setState({ popover: null });
  onPopInput = (e) => { const p = this.state.popover; if (p) this.setState({ popover: { ...p, text: e.target.value } }); };
  setPopCount = (n) => { const p = this.state.popover; if (p) this.setState({ popover: { ...p, count: n } }); };
  setPopLevel = (l) => { const p = this.state.popover; if (p) this.setState({ popover: { ...p, level: l } }); };
  onPopKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submitGen(); }
    else if (e.key === 'Escape') this.closePopover();
  };
  // weave the chosen quantity/level into the prompt the backend receives
  composePrompt(p) {
    const bits = [];
    if (p.count) bits.push('Gere ' + p.count + ' questões');
    if (p.level) bits.push('de nível ' + p.level);
    let head = bits.join(' ');
    if (head) head += '.';
    const t = (p.text || '').trim();
    return (head + (t ? (' ' + t) : '')).trim();
  }
  submitGen = () => { const p = this.state.popover; const id = p && p.nodeId; this.closePopover(); if (id) this.startGen(id, this.composePrompt(p)); };

  // Collect text context from the nodes connected to `id` to ground the AI.
  gatherContext(id) {
    const byId = this.byId();
    const neigh = this.state.connections.filter(c => c.from === id || c.to === id).map(c => byId[c.from === id ? c.to : c.from]).filter(Boolean);
    const out = [];
    neigh.forEach(n => {
      if ((n.type === 'note' || n.type === 'pdf') && (n.content || '').trim()) { const lbl = n.title || n.filename; out.push('Material' + (lbl ? ' [' + lbl + ']' : '') + ':\n' + n.content.trim().slice(0, 12000)); }
      else if (n.type === 'image' && (n.caption || '').trim()) out.push('Imagem [' + n.caption.trim() + ']');
      else if (n.type === 'lesson') out.push((n.kicker ? n.kicker + ': ' : '') + (n.titleText || '') + ((n.materialText || '').trim() ? ('\n' + n.materialText.trim().slice(0, 8000)) : ''));
      else if (n.type === 'title') out.push('Disciplina: ' + (n.titleBig || ''));
      else if (n.type === 'generated' && n.filled && n.questions) out.push('Questões já geradas: ' + n.questions.map(q => q.text).join(' | '));
    });
    return out;
  }

  // Real generation: call the backend proxy, then animate the typed result.
  startGen(id, prompt) {
    this.clearGenTimers();
    const promptText = (prompt || '').trim();
    this.setState({ selectedId: id, gen: { nodeId: id, phase: 'reading', statusText: 'lendo nós conectados…', shown: 0 } });
    const disc = this.disc(this.state.activeDisc);
    const payload = { discipline: disc ? disc.name : '', context: this.gatherContext(id), prompt: promptText };
    this.t1 = setTimeout(() => { const g = this.state.gen; if (g && g.nodeId === id && g.phase === 'reading') this.setState({ gen: { ...g, statusText: 'compondo questões com a IA…' } }); }, 900);
    fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('erro ' + res.status));
        return data;
      })
      .then((data) => {
        const g = this.state.gen;
        if (!g || g.nodeId !== id) return; // navegou para fora / nó removido
        const questions = (data.questions || []).map((q, i) => ({
          n: q.n || String(i + 1).padStart(2, '0'),
          text: q.text || '',
          solution: Array.isArray(q.solution) ? q.solution : [],
          answer: q.answer || '',
        }));
        if (!questions.length) throw new Error('nenhuma questão gerada');
        this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, questions, blockTitle: data.title || 'Bloco de Questões', lastPrompt: promptText } : n) });
        this.startTyping(id);
      })
      .catch((err) => {
        clearTimeout(this.t1);
        if (this.state.gen && this.state.gen.nodeId === id) this.setState({ gen: null });
        this.toast('IA: ' + (err && err.message ? err.message : 'falha ao gerar'));
      });
  }
  startTyping(id) {
    const node = this.byId()[id];
    const qs = (node && node.questions) || [];
    this.setState({ gen: { nodeId: id, phase: 'typing', statusText: '', shown: 0 } });
    const total = qs.reduce((s, q) => s + q.text.length, 0) || 1;
    this.typer = setInterval(() => {
      const g = this.state.gen;
      if (!g || g.nodeId !== id || g.phase !== 'typing') { clearInterval(this.typer); return; }
      const s = g.shown + 3;
      if (s >= total) { clearInterval(this.typer); this.finishGen(id); }
      else this.setState({ gen: { ...g, shown: s } });
    }, 18);
  }
  finishGen(id) {
    this.clearGenTimers();
    this.setState({
      nodes: this.state.nodes.map(n => {
        if (n.id !== id) return n;
        if (n.userSized) return { ...n, filled: true };            // keep the size the user set
        const cnt = (n.questions || []).length;
        return { ...n, filled: true, w: 364, h: Math.max(220, 150 + cnt * 72) };
      }),
      gen: null,
    });
  }
  regen(id) {
    const node = this.byId()[id];
    const prompt = (node && node.lastPrompt) || '';
    this.setState({ nodes: this.state.nodes.map(n => n.id === id ? (n.userSized ? { ...n, filled: false } : { ...n, filled: false, w: 300, h: 156 }) : n) });
    this.startGen(id, prompt);
  }
  skipTyping = (id) => {
    if (this.g && this.g.moved) return;
    const g = this.state.gen;
    if (g && g.nodeId === id && g.phase === 'typing') this.finishGen(id);
  };
  clearGenTimers() { clearTimeout(this.t1); clearTimeout(this.t2); clearInterval(this.typer); }

  // ---------- reading ----------
  openReading = (id) => {
    const node = this.byId()[id];
    const qs = (node && node.questions) || [];
    this.setState({ reading: { nodeId: id, resolved: qs.map(q => !!q.resolved), reveal: qs.map(() => false) } });
  };
  closeReading = () => this.setState({ reading: null });
  toggleResolve = (i) => {
    const r = this.state.reading; if (!r) return;
    const res = r.resolved.slice(); res[i] = !res[i];
    this.setState({
      reading: { ...r, resolved: res },
      nodes: this.state.nodes.map(n => n.id === r.nodeId ? { ...n, questions: (n.questions || []).map((q, idx) => idx === i ? { ...q, resolved: res[i] } : q) } : n),
    });
  };
  toggleReveal = (i) => { const r = this.state.reading; if (!r) return; const rv = r.reveal.slice(); rv[i] = !rv[i]; this.setState({ reading: { ...r, reveal: rv } }); };
  // persist the student's written work / margin note onto the question itself
  updateQ(i, field, val) {
    const r = this.state.reading; if (!r) return;
    this.setState({ nodes: this.state.nodes.map(n => n.id === r.nodeId ? { ...n, questions: (n.questions || []).map((q, idx) => idx === i ? { ...q, [field]: val } : q) } : n) });
  }
  deleteQuestion(i) {
    const r = this.state.reading;
    if (!r) return;
    const node = this.byId()[r.nodeId];
    if (!node || !node.questions) return;
    const questions = node.questions.filter((_, idx) => idx !== i);
    this.setState({
      nodes: this.state.nodes.map(n => n.id === r.nodeId ? { ...n, questions } : n),
      reading: { ...r, resolved: r.resolved.filter((_, idx) => idx !== i), reveal: r.reveal.filter((_, idx) => idx !== i) },
    });
    this.toast('Questão removida');
  }

  // ---------- flashcards / review (Leitner box 1-3) — deck can span many blocks ----------
  // a deck is [{ nodeId, qi }] so "Revisar tudo" mixes every generated block
  // order weakest-first: lower Leitner box and unresolved come first (spaced-repetition-ish)
  orderDeck(refs) {
    const byId = this.byId();
    // weakest-first by Leitner box; stable sort keeps same-box cards in natural order
    return refs.slice().sort((a, b) => {
      const qa = (byId[a.nodeId] && byId[a.nodeId].questions[a.qi]) || {};
      const qb = (byId[b.nodeId] && byId[b.nodeId].questions[b.qi]) || {};
      return (qa.box || 1) - (qb.box || 1);
    });
  }
  openFlash = (id) => {
    const node = this.byId()[id];
    const qs = (node && node.questions) || [];
    if (!qs.length) { this.toast('Gere questões primeiro'); return; }
    const deck = this.orderDeck(qs.map((q, qi) => ({ nodeId: id, qi })));
    this.setState({ flash: { deck, idx: 0, flipped: false, title: node.blockTitle || 'Bloco de Questões' } });
  };
  reviewAll = () => {
    let deck = [];
    this.state.nodes.forEach(n => {
      if (n.type === 'generated' && n.filled) (n.questions || []).forEach((q, qi) => deck.push({ nodeId: n.id, qi }));
    });
    if (!deck.length) { this.toast('Nenhuma questão gerada ainda neste quadro'); return; }
    deck = this.orderDeck(deck);
    this.setState({ flash: { deck, idx: 0, flipped: false, title: 'Revisão geral' } });
  };
  closeFlash = () => this.setState({ flash: null });
  flipCard = () => { const f = this.state.flash; if (f) this.setState({ flash: { ...f, flipped: !f.flipped } }); };
  shuffleFlash = () => {
    const f = this.state.flash; if (!f) return;
    const d = f.deck.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
    this.setState({ flash: { ...f, deck: d, idx: 0, flipped: false } });
    this.toast('Baralho embaralhado');
  };
  flashGo = (d) => {
    const f = this.state.flash; if (!f) return;
    let idx = f.idx + d; if (idx < 0) idx = 0; if (idx >= f.deck.length) idx = f.deck.length - 1;
    this.setState({ flash: { ...f, idx, flipped: false } });
  };
  markCard = (know) => {
    const f = this.state.flash; if (!f) return;
    const ref = f.deck[f.idx]; if (!ref) return;
    const node = this.byId()[ref.nodeId]; const q = node && (node.questions || [])[ref.qi]; if (!q) return;
    const box = know ? Math.min(3, (q.box || 1) + 1) : 1;
    this.setState({ nodes: this.state.nodes.map(n => n.id === ref.nodeId ? { ...n, questions: n.questions.map((x, idx) => idx === ref.qi ? { ...x, box, resolved: know ? true : x.resolved } : x) } : n) });
    if (f.idx + 1 < f.deck.length) this.setState({ flash: { ...f, idx: f.idx + 1, flipped: false } });
    else { this.toast('Revisão concluída'); this.setState({ flash: null }); }
  };

  // ---------- export to PDF (print window) ----------
  exportReadingPdf = () => { const r = this.state.reading; if (r) { const n = this.byId()[r.nodeId]; if (n) this.exportBlockPdf(n); } };
  exportBlockPdf(node) {
    const qs = node.questions || [];
    const disc = this.disc(this.state.activeDisc);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = qs.map(q => '<div class="q"><div class="qh"><span class="n">' + esc(q.n) + '</span><span class="t">' + esc(q.text) + '</span></div>' +
      ((q.work && q.work.trim()) ? '<div class="work"><div class="lbl2">Sua resolução</div><p>' + esc(q.work).replace(/\n/g, '<br>') + '</p></div>' : '') +
      ((q.solution && q.solution.length) ? '<div class="sol"><div class="lbl">Resolução</div>' + q.solution.map(s => '<p>' + esc(s) + '</p>').join('') + '<p class="ans">→ ' + esc(q.answer) + '</p></div>' : '') + '</div>').join('');
    const title = esc(node.blockTitle || 'Bloco de Questões');
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      '*{box-sizing:border-box}body{font-family:Georgia,serif;color:#211E1A;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.5}' +
      'h1{font-size:28px;margin:0 0 4px}.meta{font-family:ui-monospace,monospace;font-size:11px;color:#666;margin-bottom:24px;text-transform:uppercase;letter-spacing:.08em}' +
      '.q{padding:16px 0;border-bottom:1px solid #ddd;break-inside:avoid}.qh{display:flex;gap:12px}.n{color:#7A1F2B;font-weight:bold;font-size:18px}.t{font-size:15px}' +
      '.sol{margin:10px 0 0 34px;padding:10px 14px;background:#f6f4ef;border-left:2px solid #7A1F2B}.lbl{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7A1F2B;margin-bottom:6px}' +
      '.sol p{margin:0 0 6px;font-size:13px}.ans{color:#7A1F2B;font-weight:bold}' +
      '.work{margin:10px 0 0 34px;padding:10px 14px;background:#fbfaf6;border-left:2px solid #999}.lbl2{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#666;margin-bottom:6px}.work p{margin:0;font-size:13px;white-space:pre-wrap}@media print{body{margin:0}}' +
      '</style></head><body><h1>' + title + '</h1><div class="meta">' + esc(disc ? disc.name : '') + ' · ' + qs.length + ' questões</div>' + rows +
      '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},250)}</scr' + 'ipt></body></html>';
    const w = window.open('', '_blank');
    if (!w) { this.toast('Permita pop-ups para exportar o PDF'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---------- material ----------
  openMaterial = (info) => { this.setState({ material: { ...info } }); };
  closeMaterial = () => this.setState({ material: null });
  setMaterialText(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, materialText: val } : n) }); }

  // ---------- search ----------
  openSearch = () => this.setState({ search: { q: '', sel: 0 } });
  closeSearch = () => this.setState({ search: null });
  onSearchInput = (e) => this.setState({ search: { q: e.target.value, sel: 0 } });
  onSearchKey = (e) => {
    const s = this.state.search; if (!s) return;
    if (e.key === 'Escape') return this.closeSearch();
    const res = this.searchResults(s.q);
    if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ search: { ...s, sel: Math.min((s.sel || 0) + 1, Math.max(0, res.length - 1)) } }); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ search: { ...s, sel: Math.max((s.sel || 0) - 1, 0) } }); return; }
    if (e.key === 'Enter') { const r = res[s.sel || 0] || res[0]; if (r) r.pick(); }
  };
  norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  searchItems() {
    const items = [];
    // use the live board for the discipline currently open in the canvas
    const boards = { ...this.state.boards };
    if (this.state.screen === 'canvas' && this.state.activeDisc) boards[this.state.activeDisc] = { nodes: this.state.nodes, connections: this.state.connections };
    this.state.disciplines.forEach(d => {
      items.push({ type: 'DISC', title: d.name, context: (d.semester || '') + (d.aulas ? (' · ' + d.aulas + ' aulas') : ''), pick: () => { this.closeSearch(); this.openDiscipline(d.id); } });
      const board = boards[d.id];
      if (!board) return;
      board.nodes.filter(n => n.type === 'lesson').forEach(ls => {
        items.push({ type: 'AULA', title: ls.titleText, context: d.name + ' · ' + (ls.kicker || 'Aula'), pick: () => { this.closeSearch(); this.openDiscipline(d.id); setTimeout(() => this.openMaterial({ kicker: ls.kicker || 'Aula', title: ls.titleText, key: ls.lessonKey, meta: ls.material || 'material' }), 120); } });
      });
      board.nodes.filter(n => n.type === 'note').forEach(nt => {
        items.push({ type: 'NOTA', title: nt.title || 'Nota', context: d.name + ' · nota', body: nt.content || '', pick: () => { this.closeSearch(); this.openDiscipline(d.id); } });
      });
      board.nodes.filter(n => n.type === 'image' && (n.caption || '').trim()).forEach(im => {
        items.push({ type: 'IMG', title: im.caption || 'Imagem', context: d.name + ' · imagem', body: im.caption || '', pick: () => { this.closeSearch(); this.openDiscipline(d.id); } });
      });
      board.nodes.filter(n => n.type === 'pdf').forEach(pf => {
        items.push({ type: 'PDF', title: pf.filename || 'documento.pdf', context: d.name + ' · pdf', body: pf.content || '', pick: () => { this.closeSearch(); this.openDiscipline(d.id); } });
      });
      board.nodes.filter(n => n.type === 'generated' && n.filled).forEach(gn => {
        items.push({ type: 'NÓ', title: gn.blockTitle || 'Bloco de Questões', context: d.name + ' · gerado', body: (gn.questions || []).map(q => q.text).join(' '), pick: () => { this.closeSearch(); this.openDiscipline(d.id); setTimeout(() => this.openReading(gn.id), 140); } });
      });
    });
    return items;
  }
  searchResults(q) {
    const nq = this.norm(q);
    if (!nq) return [];
    return this.searchItems().filter(it => this.norm(it.title).includes(nq) || this.norm(it.context).includes(nq) || this.norm(it.body || '').includes(nq)).slice(0, 8);
  }

  // ---------- new discipline (optionally from a syllabus → AI pre-canvas) ----------
  openNewDisc = () => this.setState({ newDisc: { syllabus: '', useAI: true, busy: false } });
  closeNewDisc = () => { const nd = this.state.newDisc; if (nd && nd.busy) return; this.setState({ newDisc: null }); };
  onNewKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.createDisc(); } else if (e.key === 'Escape') this.closeNewDisc(); };
  setSyllabus = (e) => { const nd = this.state.newDisc; if (nd) this.setState({ newDisc: { ...nd, syllabus: e.target.value } }); };
  toggleUseAI = () => { const nd = this.state.newDisc; if (nd) this.setState({ newDisc: { ...nd, useAI: !nd.useAI } }); };
  setSylInput = (el) => { this.sylInput = el; };
  pickSyllabusPdf = () => { if (this.sylInput) this.sylInput.click(); };
  onSyllabusPdf = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    this.toast('Lendo cronograma…');
    try { const text = await this.extractPdf(file); const nd = this.state.newDisc; if (nd) this.setState({ newDisc: { ...nd, syllabus: (text || '').slice(0, 16000) } }); this.toast('Cronograma carregado — confira e crie'); }
    catch (err) { this.toast('Falha ao ler o PDF'); }
  };
  async fetchOutline(name, syllabus) {
    const res = await fetch('/api/outline', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ discipline: name, syllabus }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('erro ' + res.status));
    return data;
  }
  createDisc = async () => {
    const nd = this.state.newDisc || {};
    if (nd.busy) return;
    const name = (this.newNameEl && this.newNameEl.value.trim()) || 'Nova disciplina';
    const sem = (this.newSemEl && this.newSemEl.value.trim()) || this.curIdent().term;
    const syllabus = (nd.syllabus || '').trim();
    let lessons = [];
    if (syllabus && nd.useAI !== false) {
      this.setState({ newDisc: { ...nd, busy: true } });
      try { const out = await this.fetchOutline(name, syllabus); lessons = (out.lessons || []).map(s => String(s).trim()).filter(Boolean).slice(0, 16); }
      catch (e) { this.toast('IA: não consegui ler o cronograma — criei o quadro vazio'); }
      if (!this.state.newDisc) return; // closed meanwhile
    }
    const id = 'd' + (++this.dynNum) + '-' + (this.nidc + this.cid);
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    const d = { id, name, num: roman[this.state.disciplines.length] || String(this.state.disciplines.length + 1), semester: sem, aulas: lessons.length, h: 350 + (this.state.disciplines.length % 3) * 24, lessons };
    const board = lessons.length
      ? this.starterBoard(d)
      : { nodes: [{ id: 't', type: 'title', x: -180, y: -86, w: 360, h: 172, locked: true, shortLabel: name, titleBig: name, titleMeta: sem + ' · quadro novo', kickerLabel: 'Disciplina' }], connections: [] };
    const boards = { ...this.state.boards, [id]: board };
    this.resetHist();
    this.setState({
      disciplines: [...this.state.disciplines, d], boards, newDisc: null,
      screen: 'canvas', activeDisc: id, nodes: board.nodes, connections: board.connections,
      selectedId: null, selectedConnId: null, popover: null, gen: null, drag: null, hintOpen: this.state.prefs.showHints,
    });
    this.clearGenTimers();
    requestAnimationFrame(() => this.fitView());
    setTimeout(() => { this.fitView(); this.toast(lessons.length ? ('Pré-canvas gerado · ' + lessons.length + ' matérias') : 'Quadro criado — toque duplo no papel para criar um nó'); }, 80);
  };

  // ---------- prefs ----------
  setPref(k, v) { this.setState({ prefs: { ...this.state.prefs, [k]: v } }); }
  toggleGrid = () => this.setPref('grid', !this.curGrid());
  toggleHints = () => { const v = !this.curHints(); this.setPref('showHints', v); if (v) this.setState({ hintOpen: true }); };
  curAccent() { return this.state.prefs.accent ?? this.props.accent ?? '#7A1F2B'; }
  curSerif() { return this.state.prefs.serif ?? this.props.serifFont ?? 'Cormorant Garamond'; }
  curGrid() { const p = this.state.prefs.grid; return p === null ? (this.props.paperGrid ?? true) : p; }
  curHints() { return this.state.prefs.showHints; }
  // editable identity (persisted in prefs.ident, overrides the IDENT defaults)
  curIdent() {
    const id = { ...this.IDENT, ...(this.state.prefs.ident || {}) };
    if (!id.initials && id.name) id.initials = id.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return id;
  }
  setIdent(field, val) { this.setState({ prefs: { ...this.state.prefs, ident: { ...(this.state.prefs.ident || {}), [field]: val } } }); }

  // ---------- view ----------
  applyZoom(cx, cy, f) {
    const S = this.state;
    const nz = Math.min(2.4, Math.max(0.4, S.zoom * f));
    const wx = (cx - S.pan.x) / S.zoom, wy = (cy - S.pan.y) / S.zoom;
    this.setState({ zoom: nz, pan: { x: cx - wx * nz, y: cy - wy * nz } });
  }
  onWheel = (e) => { e.preventDefault(); const r = this.vp.getBoundingClientRect(); this.applyZoom(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0012)); };
  zoomBy = (f) => { const r = this.vp.getBoundingClientRect(); this.applyZoom(r.width / 2, r.height / 2, f); };
  fitView = () => {
    const ns = this.state.nodes;
    if (!ns.length || !this.vp) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ns.forEach(n => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); });
    const r = this.vp.getBoundingClientRect();
    if (r.width < 2) return;
    const pad = 130;
    const zw = (r.width - 2 * pad) / Math.max(1, maxX - minX);
    const zh = (r.height - 2 * pad) / Math.max(1, maxY - minY);
    const z = Math.max(0.45, Math.min(zw, zh, 1.25));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this.setState({ zoom: z, pan: { x: r.width / 2 - cx * z, y: r.height / 2 - cy * z } });
  };

  edge(n, tx, ty) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const hw = n.w / 2, hh = n.h / 2;
    const s = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
    return { x: cx + dx * s, y: cy + dy * s };
  }
  computeShown(shown, qs) {
    qs = qs || [];
    let rem = shown; const out = []; let caretIdx = -1;
    for (let i = 0; i < qs.length; i++) {
      const full = qs[i].text.length;
      if (rem <= 0) break;
      if (rem >= full) { out.push({ n: qs[i].n, text: qs[i].text }); rem -= full; }
      else { out.push({ n: qs[i].n, text: qs[i].text.slice(0, rem) }); caretIdx = i; rem = 0; }
    }
    if (caretIdx === -1 && out.length) caretIdx = out.length - 1;
    return out.map((o, i) => ({ n: o.n, text: o.text, caret: i === caretIdx }));
  }

  onKey = (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (this.state.search) this.closeSearch(); else this.openSearch(); return; }
    const t = e.target;
    const typing = t && /input|textarea/i.test(t.tagName);
    if (e.key === 'Escape') {
      if (this.state.search) return this.closeSearch();
      if (this.state.imgView) return this.closeImg();
      if (this.state.pdfView) return this.closePdf();
      if (this.state.noteEdit) return this.closeNoteEditor();
      if (this.state.renameDisc) return this.closeRename();
      if (this.state.discMenu) return this.closeDiscMenu();
      if (this.state.newDisc) return this.closeNewDisc();
      if (this.state.flash) return this.closeFlash();
      if (this.state.material) return this.closeMaterial();
      if (this.state.reading) return this.closeReading();
      if (this.state.popover) return this.closePopover();
      if (this.state.selectedConnId) return this.setState({ selectedConnId: null });
      if (this.state.selectedId) return this.setState({ selectedId: null });
      return;
    }
    // PDF viewer (imperative overlay) keyboard: zoom + page scroll
    if (this.pdfEl) {
      if (typing) return; // typing in the ask/search inputs
      if (e.key === '+' || e.key === '=') { e.preventDefault(); return this.zoomPdf(1.15); }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); return this.zoomPdf(1 / 1.15); }
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (this.pdfBody) this.pdfBody.scrollBy({ top: this.pdfBody.clientHeight * 0.85, behavior: 'smooth' }); return; }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (this.pdfBody) this.pdfBody.scrollBy({ top: -this.pdfBody.clientHeight * 0.85, behavior: 'smooth' }); return; }
      return;
    }
    // flashcard keyboard (overlay is on top → capture even if a background field has focus)
    if (this.state.flash) {
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') { e.preventDefault(); return this.flipCard(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.flashGo(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.flashGo(1); }
      if (e.key === '1') { e.preventDefault(); return this.markCard(true); }
      if (e.key === '2') { e.preventDefault(); return this.markCard(false); }
      return;
    }
    if (typing) return;
    // canvas keyboard editing
    if (this.state.screen === 'canvas') {
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if ((e.key === 'y' || e.key === 'Y') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.redo(); return; }
      if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && this.state.selectedId) { e.preventDefault(); this.duplicateNode(this.state.selectedId); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (this.state.selectedConnId) { e.preventDefault(); this.deleteConn(this.state.selectedConnId); return; }
        if (this.state.selectedId) { e.preventDefault(); this.deleteNode(this.state.selectedId); return; }
      }
      // zoom & framing
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomBy(1.2); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomBy(1 / 1.2); return; }
      if (e.key === '0') { e.preventDefault(); this.fitView(); return; }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.frameSelection(); return; }
    }
  };
  // zoom to fit the selected node (or the whole board if none selected)
  frameSelection = () => {
    const n = this.byId()[this.state.selectedId];
    if (!n || !this.vp) { this.fitView(); return; }
    const r = this.vp.getBoundingClientRect();
    if (r.width < 2) return;
    const pad = 120;
    const z = Math.max(0.5, Math.min((r.width - 2 * pad) / Math.max(1, n.w), (r.height - 2 * pad) / Math.max(1, n.h), 1.6));
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    this.setState({ zoom: z, pan: { x: r.width / 2 - cx * z, y: r.height / 2 - cy * z } });
  };

  renderVals() {
    const S = this.state;
    const accent = this.curAccent();
    const serifVar = "'" + this.curSerif() + "', Georgia, serif";
    const grid = this.curGrid();
    const byId = this.byId();
    const center = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
    const activeName = (this.disc(S.activeDisc) || {}).name || '';

    // masthead
    const showCrumb = S.screen !== 'biblioteca';
    const crumbName = S.screen === 'conta' ? 'Conta' : activeName;

    // spines
    const spines = S.disciplines.map(d => ({
      id: d.id, name: d.name, num: d.num, aulas: d.aulas + ' aulas', h: d.h,
      active: d.id === S.activeDisc, normal: d.id !== S.activeDisc, ghost: false, canMenu: true,
      color: d.color || accent,
      onOpen: () => this.openDiscipline(d.id),
      onMenu: (e) => { this.stop(e); this.openDiscMenu(d.id); },
    }));
    spines.push({ ghost: true, active: false, normal: false, h: 300, name: '', num: '', aulas: '', onOpen: this.openNewDisc });

    // aggregate counts across all boards (live board for the open discipline)
    const allBoards = { ...S.boards };
    if (S.screen === 'canvas' && S.activeDisc) allBoards[S.activeDisc] = { nodes: S.nodes, connections: S.connections };
    let lessonCount = 0, nodeCount = 0, genCount = 0;
    Object.keys(allBoards).forEach(k => {
      (allBoards[k].nodes || []).forEach(n => {
        if (n.type === 'lesson') { lessonCount++; nodeCount++; }
        else if (n.type === 'generated') { nodeCount++; if (n.filled) genCount++; }
        else if (n.type === 'note' || n.type === 'image' || n.type === 'pdf') { nodeCount++; }
      });
    });
    const footerStats = S.disciplines.length + ' disciplinas · ' + lessonCount + ' aulas · ' + nodeCount + ' nós';

    // canvas lines + nodes
    let connDelete = null;
    const lines = S.connections.map(cn => {
      const A = byId[cn.from], B = byId[cn.to];
      if (!A || !B) return null;
      const ca = center(A), cb = center(B);
      const pa = this.edge(A, cb.x, cb.y), pb = this.edge(B, ca.x, ca.y);
      const isSel = S.selectedConnId === cn.id;
      const touches = S.selectedId && (cn.from === S.selectedId || cn.to === S.selectedId);
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      if (isSel) connDelete = { x: mx, y: my, onDel: (e) => { this.stop(e); this.deleteConn(cn.id); }, onStop: this.stop };
      return {
        id: cn.id, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, mx, my, isSel,
        stroke: (isSel || touches) ? accent : 'rgba(33,30,26,0.5)',
        width: isSel ? 2.4 : 1.25,
        dotBg: isSel ? accent : 'rgba(255,253,248,0.92)',
        onSelect: (e) => { this.stop(e); this.selectConn(cn.id); },
        onStop: this.stop,
      };
    }).filter(Boolean);

    let dragLine = null;
    if (S.drag) {
      const A = byId[S.drag.fromId];
      if (A) {
        let to = S.drag.cur;
        if (S.drag.overId && byId[S.drag.overId]) to = this.edge(byId[S.drag.overId], center(A).x, center(A).y);
        const from = this.edge(A, to.x, to.y);
        dragLine = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
      }
    }

    const nodes = S.nodes.map(n => {
      const neigh = S.connections.filter(c => c.from === n.id || c.to === n.id).map(c => byId[c.from === n.id ? c.to : c.from]).filter(Boolean);
      const connectedLabel = neigh.map(x => x.shortLabel).join(' · ');
      const hasConn = neigh.length > 0;
      const genHere = !!(S.gen && S.gen.nodeId === n.id);
      const filled = !!n.filled;
      const isGen = n.type === 'generated';
      const qs = n.questions || [];
      const isNote = n.type === 'note', isImage = n.type === 'image';
      const resizable = isNote || isImage || isGen || n.type === 'pdf' || n.type === 'lesson';
      // generated body: when the user resized, honor an explicit height with scroll;
      // otherwise let it grow with content (min-height)
      let genBodyCss = '';
      if (isGen && n.h) genBodyCss = n.userSized ? ('height:' + Math.max(90, n.h - 4) + 'px;overflow:auto;') : ('min-height:' + Math.max(0, n.h - 40) + 'px;');
      const cardCss = ((n.type === 'lesson' || n.type === 'pdf') && n.userSized && n.h) ? ('min-height:' + Math.max(60, n.h - 2) + 'px;') : '';
      const v = {
        id: n.id, x: n.x, y: n.y, w: n.w, h: n.h || 0,
        isTitle: n.type === 'title', isLesson: n.type === 'lesson',
        kicker: n.kicker, titleText: n.titleText, material: n.material,
        kickerLabel: n.kickerLabel, titleBig: n.titleBig, titleMeta: n.titleMeta,
        blockTitle: n.blockTitle || 'Bloco de Questões',
        isNote,
        noteTitle: n.title || 'Nota',
        noteContent: n.content || '',
        noteSource: n.source === 'pdf' ? 'PDF · material' : 'Nota · material',
        noteAreaH: Math.max(60, (n.h || 196) - 96),
        isImage, imgSrc: n.src || '', imgCaption: n.caption || '',
        imgAreaH: Math.max(60, (n.h || 220) - 42),
        isPdf: n.type === 'pdf', pdfName: n.filename || 'documento.pdf',
        pdfMeta: (n.pages ? (n.pages + (n.pages === 1 ? ' página' : ' páginas')) : 'documento') + ((n.content || '').trim() ? ' · texto para a IA' : ''),
        pdfThumb: n.thumb || '', pdfHasThumb: !!n.thumb,
        onOpenPdf: (e) => { this.stop(e); this.openPdf(n.id); },
        genBodyCss, cardCss,
        resizable,
        selected: S.selectedId === n.id,
        isOver: !!(S.drag && S.drag.overId === n.id),
        dragCss: (S.movingId === n.id) ? 'transform:scale(1.02);filter:drop-shadow(0 16px 28px rgba(33,30,26,0.22));cursor:grabbing;z-index:20;' : '',
        connectedLabel,
        connLine: hasConn ? ('●  lê de — ' + connectedLabel) : '○  nenhum nó conectado',
        genEmpty: false, genResult: false, filled: false, showStatus: false, statusText: '', resultKicker: '', shownLines: [],
        onDown: (e) => this.nodeDown(e, n.id),
        onHandleDown: (e) => this.handleDown(e, n.id),
        onResize: (e) => this.resizeDown(e, n.id),
        onAi: (e) => { this.stop(e); this.openPopover(n.id); },
        onSkip: () => this.skipTyping(n.id),
        onRegen: (e) => { this.stop(e); this.regen(n.id); },
        onOpen: (e) => { if (e) this.stop(e); this.openReading(n.id); },
        onFlash: (e) => { if (e) this.stop(e); this.openFlash(n.id); },
        onMaterial: (e) => { this.stop(e); this.openMaterial({ id: n.id, kicker: n.kicker, title: n.titleText }); },
        onNoteInput: (e) => this.setNoteContent(n.id, e.target.value),
        onNoteTitleInput: (e) => this.setNoteTitle(n.id, e.target.value),
        onExpandNote: (e) => { this.stop(e); this.openNoteEditor(n.id); },
        hasSource: !!n.pdfSource, sourceLabel: n.pdfSource ? ('↗ p.' + n.pdfSource.page) : '',
        onSource: (e) => { this.stop(e); if (n.pdfSource) this.openPdfAt(n.pdfSource.id, n.pdfSource.page); },
        onImgCaption: (e) => this.setImageCaption(n.id, e.target.value),
        onViewImg: (e) => { this.stop(e); this.openImg(n.id); },
        onTitleRename: (e) => this.renameTitle(n.id, e.target.value),
      };
      if (isGen) {
        v.genEmpty = !filled && !genHere;
        v.genResult = genHere || filled;
        v.filled = filled;
        v.showStatus = genHere && S.gen.phase === 'reading';
        v.statusText = genHere ? S.gen.statusText : '';
        v.resultKicker = filled ? ('Gerado · ' + qs.length + ' quest' + (qs.length === 1 ? 'ão' : 'ões')) : 'Gerando';
        v.shownLines = filled ? qs.map(q => ({ n: q.n, text: this.richInline(q.text, false), caret: false })) : (genHere && S.gen.phase === 'typing' ? this.computeShown(S.gen.shown, qs) : []);
      }
      return v;
    });

    // popover position
    let popover = null;
    if (S.popover) {
      const n = byId[S.popover.nodeId];
      if (n && this.vp) {
        const r = this.vp.getBoundingClientRect();
        const sx = S.pan.x + n.x * S.zoom, sy = S.pan.y + n.y * S.zoom, sh = n.h * S.zoom;
        let left = Math.max(12, Math.min(sx, r.width - 332));
        let top = 54 + sy + sh + 12;
        if (top + 210 > r.top + r.height) top = Math.max(64, 54 + sy - 220);
        const neigh = S.connections.filter(c => c.from === n.id || c.to === n.id).map(c => byId[c.from === n.id ? c.to : c.from]).filter(Boolean);
        const pc = S.popover.count, pl = S.popover.level;
        const countOpts = [3, 5, 8, 10].map(c => ({ n: c, sel: c === pc, bg: c === pc ? accent : 'transparent', fg: c === pc ? '#FFFDF8' : 'rgba(33,30,26,0.6)', onPick: () => this.setPopCount(c) }));
        const levelOpts = [['fácil', 'Fácil'], ['médio', 'Médio'], ['difícil', 'Difícil']].map(([k, lbl]) => ({ label: lbl, sel: k === pl, bg: k === pl ? accent : 'transparent', fg: k === pl ? '#FFFDF8' : 'rgba(33,30,26,0.6)', onPick: () => this.setPopLevel(k) }));
        popover = { left, top, text: S.popover.text, chips: neigh.map(x => x.shortLabel), empty: neigh.length === 0, countOpts, levelOpts };
      }
    }

    // selection action bar (Duplicar / Excluir) floating above the selected node
    let selChrome = null;
    if (S.screen === 'canvas' && S.selectedId && !S.popover && this.vp) {
      const n = byId[S.selectedId];
      const busy = S.gen && S.gen.nodeId === S.selectedId;
      if (n && !n.locked && n.type !== 'title' && !busy) {
        const r = this.vp.getBoundingClientRect();
        const sx = S.pan.x + n.x * S.zoom, sy = S.pan.y + n.y * S.zoom;
        const cx = sx + (n.w || 280) * S.zoom / 2;              // node centre, screen space
        let left = Math.max(12, Math.min(cx - 90, r.width - 190));
        let top = 54 + sy - 50;                                  // float clearly above the node
        if (top < 62) top = 54 + sy + n.h * S.zoom + 12;         // flip below when near the top
        selChrome = { left, top, onDup: (e) => { this.stop(e); this.duplicateNode(n.id); }, onDel: (e) => { this.stop(e); this.deleteNode(n.id); }, onStop: this.stop };
      }
    }

    // reading (per-node questions)
    let reading = null, readingQs = [], readProgressW = '0%', readProgressLabel = '0 / 0 resolvidas';
    let readingKicker = 'Bloco de Questões · gerado', readingTitle = 'Bloco de Questões', readingMeta = '';
    if (S.reading) {
      reading = true;
      const node = byId[S.reading.nodeId];
      const qs = (node && node.questions) || [];
      const tot = qs.length || 1;
      const resCount = S.reading.resolved.filter(Boolean).length;
      readProgressW = Math.round((resCount / tot) * 100) + '%';
      readProgressLabel = resCount + ' / ' + qs.length + ' resolvidas';
      readingTitle = (node && node.blockTitle) || 'Bloco de Questões';
      readingKicker = readingTitle + ' · gerado';
      const rneigh = node ? S.connections.filter(c => c.from === node.id || c.to === node.id).map(c => byId[c.from === node.id ? c.to : c.from]).filter(Boolean) : [];
      const lede = rneigh.length ? ('lê de — ' + rneigh.map(x => x.shortLabel).join(' · ') + '   ·   ') : '';
      readingMeta = lede + qs.length + ' quest' + (qs.length === 1 ? 'ão' : 'ões');
      readingQs = qs.map((q, i) => {
        const resolved = S.reading.resolved[i];
        const revealed = S.reading.reveal[i];
        return {
          num: q.n, text: this.richInline(q.text, false),
          resolved, revealed,
          checkBorder: resolved ? accent : 'rgba(33,30,26,0.3)',
          checkBg: resolved ? accent : 'transparent',
          checkMark: resolved ? '✓' : '',
          resolveColor: resolved ? accent : 'rgba(33,30,26,0.5)',
          resolveLabel: resolved ? 'resolvida' : 'marcar resolvida',
          revealLabel: revealed ? 'ocultar resolução' : 'ver resolução',
          solution: (q.solution || []).map(s => this.richInline(s, false)), hasTable: false, answer: this.richInline(q.answer || '', false),
          work: q.work || '', margin: q.margin || '',
          onResolve: () => this.toggleResolve(i),
          onReveal: () => this.toggleReveal(i),
          onDelete: () => this.deleteQuestion(i),
          onWork: (e) => this.updateQ(i, 'work', e.target.value),
          onMargin: (e) => this.updateQ(i, 'margin', e.target.value),
        };
      });
    }

    // flashcards / review (deck may span multiple blocks)
    let flash = null, flashNum = '', flashText = '', flashSolution = [], flashAnswer = '', flashFront = true, flashBack = false, flashCount = '', flashFrom = '';
    if (S.flash) {
      const ref = S.flash.deck[S.flash.idx];
      const fnode = ref ? byId[ref.nodeId] : null;
      const fq = fnode ? (fnode.questions || [])[ref.qi] : null;
      if (fq) {
        flash = true;
        flashNum = fq.n; flashText = this.richInline(fq.text, false); flashSolution = (fq.solution || []).map(s => this.richInline(s, false)); flashAnswer = this.richInline(fq.answer || '', false);
        flashFront = !S.flash.flipped; flashBack = !!S.flash.flipped;
        flashCount = (S.flash.idx + 1) + ' / ' + S.flash.deck.length;
        flashFrom = (S.flash.title === 'Revisão geral' && fnode) ? (fnode.blockTitle || 'Bloco de Questões') : '';
      }
    }

    // truth table flat cells (kept for the material viewer)
    const truthHead = this.TRUTH.head;
    const truthCells = [].concat.apply([], this.TRUTH.rows);

    // material
    let material = null;
    if (S.material) {
      const node = byId[S.material.id];
      const txt = (node && node.materialText) || '';
      material = {
        kicker: S.material.kicker || 'Aula', title: S.material.title || '',
        meta: txt.trim() ? (txt.length + ' caracteres') : 'sem conteúdo ainda',
        text: txt, onText: (e) => this.setMaterialText(S.material.id, e.target.value),
      };
    }

    // search
    let search = null, searchEmpty = false, searchHasResults = false, searchNoResults = false, searchResults = [], suggestions = [];
    if (S.search) {
      search = { q: S.search.q };
      const q = S.search.q;
      if (!this.norm(q)) {
        searchEmpty = true;
        suggestions = S.disciplines.slice(0, 5).map(d => ({ text: d.name, onPick: () => this.setState({ search: { q: d.name, sel: 0 } }) }));
      } else {
        const res = this.searchResults(q);
        const sel = Math.max(0, Math.min(S.search.sel || 0, res.length - 1));
        searchResults = res.map((r, i) => ({ type: r.type, title: r.title, context: r.context, onPick: r.pick, selected: i === sel, rowBg: i === sel ? '#FAF8F3' : 'transparent' }));
        searchHasResults = res.length > 0;
        searchNoResults = res.length === 0;
      }
    }

    // note editor (Notion-style, full-screen)
    let noteEdit = null;
    if (S.noteEdit) {
      const n = byId[S.noteEdit.id];
      if (n) {
        const isPreview = S.noteEdit.mode === 'preview';
        noteEdit = {
          title: n.title || '', content: n.content || '',
          isEdit: !isPreview, isPreview,
          modeLabel: isPreview ? '✎ Editar' : '◉ Pré-visualizar',
          chars: (n.content || '').length + ' caracteres',
          blocks: isPreview ? this.mdBlocks(n.content || '') : [],
          onTitle: (e) => this.setNoteTitle(n.id, e.target.value),
          onBody: (e) => this.setNoteContent(n.id, e.target.value),
          onBodyKey: this.onNoteEditorKey,
        };
      } else { noteEdit = null; }
    }

    // image lightbox overlay
    const imgView = S.imgView ? { caption: S.imgView.caption || '', url: S.imgView.url || '', hasUrl: !!S.imgView.url } : null;

    // pdf viewer overlay
    // new-discipline modal (syllabus → AI pre-canvas)
    const nd = S.newDisc;
    const newDiscView = nd ? {
      syllabus: nd.syllabus || '',
      busy: !!nd.busy,
      useAI: nd.useAI !== false,
      aiTrack: (nd.useAI !== false) ? accent : 'transparent',
      aiKnob: (nd.useAI !== false) ? '22px' : '2px',
      hasSyllabus: !!(nd.syllabus || '').trim(),
      createLabel: nd.busy ? 'Gerando…' : ((nd.syllabus || '').trim() && nd.useAI !== false ? 'Criar com IA' : 'Criar quadro'),
    } : null;

    // accent swatches + serif options
    const accentSwatches = [
      { color: '#7A1F2B', label: 'Oxblood' }, { color: '#2E3A2C', label: 'Verde-folha' },
      { color: '#243043', label: 'Azul-tinta' }, { color: '#5A3A22', label: 'Sépia' },
    ].map(sw => ({ ...sw, selected: this.curAccent() === sw.color, onPick: () => this.setPref('accent', sw.color) }));
    const curSerifName = this.curSerif();
    const serifOptions = [
      { short: 'Cormorant', full: 'Cormorant Garamond' }, { short: 'Plex Serif', full: 'IBM Plex Serif' },
    ].map((o, i) => ({ short: o.short, bg: curSerifName === o.full ? accent : 'transparent', fg: curSerifName === o.full ? '#FFFDF8' : 'rgba(33,30,26,0.7)', sep: i === 0 ? 'none' : '1px solid rgba(33,30,26,0.18)', onPick: () => this.setPref('serif', o.full) }));

    // shelf: per-discipline menu + rename dialog
    let discMenu = null;
    if (S.discMenu) {
      const d = this.disc(S.discMenu.id);
      if (d) {
        const idx = S.disciplines.findIndex(x => x.id === d.id);
        const palette = ['#7A1F2B', '#2E3A2C', '#243043', '#5A3A22', '#3A2A4A', '#1F4A4A'];
        const cur = d.color || accent;
        discMenu = {
          name: d.name, meta: (d.semester || '') + (d.aulas ? (' · ' + d.aulas + ' aulas') : ''),
          colors: palette.map(c => ({ color: c, selected: c === cur, onPick: () => this.setDiscColor(d.id, c) })),
          canLeft: idx > 0, canRight: idx < S.disciplines.length - 1,
          onMoveLeft: () => this.moveDisc(-1), onMoveRight: () => this.moveDisc(1),
        };
      }
    }
    const renameDisc = S.renameDisc ? { name: S.renameDisc.name || '' } : null;

    // cloud / account status (for the Conta screen)
    const cloudUnavailable = !S.cloud;
    const cloudLoggedIn = !!(S.cloud && S.session);
    const cloudNeedsAuth = !!(S.cloud && !S.session);

    // identity
    const ident = this.curIdent();

    return {
      accent, serifVar,
      // masthead
      showCrumb, crumbName, goHome: this.goHome, openConta: this.openConta, openSearch: this.openSearch,
      contaBg: S.screen === 'conta' ? accent : '#FFFDF8', contaFg: S.screen === 'conta' ? '#FFFDF8' : '#211E1A',
      identInitials: ident.initials || '·',
      // screens
      showBiblioteca: S.screen === 'biblioteca', showCanvas: S.screen === 'canvas', showConta: S.screen === 'conta',
      spines, footerStats,
      shelfName: ident.name, shelfMeta: ident.course ? (ident.course + ' · ' + ident.term) : ident.term,
      // canvas
      setVp: this.setVp, stop: this.stop,
      onBgPointerDown: this.onBgPointerDown, onBgDblClick: this.onBgDblClick,
      panX: S.pan.x, panY: S.pan.y,
      worldTransform: 'translate(' + S.pan.x + 'px, ' + S.pan.y + 'px) scale(' + S.zoom + ')',
      bgImage: grid ? 'radial-gradient(circle, rgba(40,32,24,0.16) 1px, transparent 1.4px)' : 'none',
      bgSize: Math.max(7, 28 * S.zoom),
      cursor: S.drag ? 'crosshair' : (S.panning ? 'grabbing' : 'grab'),
      lines, dragLine, nodes, connDelete, selChrome,
      canUndo: this.histStack.length > 0, canRedo: this.redoStack.length > 0,
      undo: this.undo, redo: this.redo,
      zoomPct: Math.round(S.zoom * 100) + '%',
      zoomIn: () => this.zoomBy(1.2), zoomOut: () => this.zoomBy(1 / 1.2), resetView: this.fitView,
      addNode: this.addNode, cornerAi: this.cornerAi,
      addNoteNode: this.addNoteNode, pickPdf: this.pickPdf, setFileInput: this.setFileInput, onPdfPick: this.onPdfPick,
      pickImage: this.pickImage, setImgInput: this.setImgInput, onImgPick: this.onImgPick,
      // note editor (Notion-style)
      noteEdit, closeNoteEditor: this.closeNoteEditor, toggleNotePreview: this.toggleNotePreview, setNoteBodyRef: this.setNoteBodyRef,
      // pdf viewer
      // image lightbox
      imgView, imgViewUrl: imgView ? imgView.url : '', imgViewCaption: imgView ? imgView.caption : '', closeImg: this.closeImg,
      hintOpen: S.screen === 'canvas' && S.hintOpen && this.curHints(),
      hintClosed: S.screen === 'canvas' && !(S.hintOpen && this.curHints()),
      dismissHint: () => this.setState({ hintOpen: false }), openHint: () => this.setState({ hintOpen: true }),
      // popover
      popover, setAiInput: this.setAiInput, onPopInput: this.onPopInput, onPopKey: this.onPopKey, closePopover: this.closePopover, submitGen: this.submitGen,
      // reading
      reading, readingQs, readProgressW, readProgressLabel, readingKicker, readingTitle, readingMeta, closeReading: this.closeReading,
      exportReadingPdf: this.exportReadingPdf,
      openFlashReading: () => { const r = this.state.reading; if (r) this.openFlash(r.nodeId); },
      // flashcards / review
      flash, flashNum, flashText, flashSolution, flashAnswer, flashFront, flashBack, flashCount, flashFrom,
      closeFlash: this.closeFlash, flipCard: this.flipCard,
      flashPrev: () => this.flashGo(-1), markKnow: () => this.markCard(true), markReview: () => this.markCard(false),
      shuffleFlash: this.shuffleFlash,
      reviewAll: this.reviewAll, hasReview: S.nodes.some(n => n.type === 'generated' && n.filled),
      truthHead, truthCells,
      // material
      material, closeMaterial: this.closeMaterial,
      // search
      search, searchEmpty, searchHasResults, searchNoResults, searchResults, suggestions,
      setSearchInput: this.setSearchInput, onSearchInput: this.onSearchInput, onSearchKey: this.onSearchKey, closeSearch: this.closeSearch,
      // new disc (+ syllabus → AI pre-canvas)
      newDisc: newDiscView, closeNewDisc: this.closeNewDisc, createDisc: this.createDisc, onNewKey: this.onNewKey, setNewName: this.setNewName, setNewSem: this.setNewSem,
      setSyllabus: this.setSyllabus, toggleUseAI: this.toggleUseAI, pickSyllabusPdf: this.pickSyllabusPdf, setSylInput: this.setSylInput, onSyllabusPdf: this.onSyllabusPdf,
      // conta
      acctName: ident.name, acctInitials: ident.initials || '·',
      acctEmail: ident.email, acctHasEmail: !!ident.email,
      acctCourse: ident.course, acctHasCourse: !!ident.course,
      acctTerm: ident.term,
      // editable profile
      editName: ident.name || '', editInitials: ident.initials || '', editCourse: ident.course || '', editTerm: ident.term || '',
      onEditName: (e) => this.setIdent('name', e.target.value),
      onEditInitials: (e) => this.setIdent('initials', (e.target.value || '').slice(0, 3).toUpperCase()),
      onEditCourse: (e) => this.setIdent('course', e.target.value),
      onEditTerm: (e) => this.setIdent('term', e.target.value),
      statDisc: String(S.disciplines.length), statNos: String(nodeCount), statGer: String(genCount),
      accentSwatches, serifOptions,
      gridTrack: grid ? accent : 'transparent', gridKnob: grid ? '22px' : '2px',
      hintsTrack: this.curHints() ? accent : 'transparent', hintsKnob: this.curHints() ? '22px' : '2px',
      toggleGrid: this.toggleGrid, toggleHints: this.toggleHints, resetAll: this.resetAll,
      exportData: this.exportData, pickImport: this.pickImport, setImportInput: this.setImportInput, onImportFile: this.onImportFile,
      deleteDiscipline: this.deleteDiscipline,
      // shelf: discipline menu + rename
      discMenu, closeDiscMenu: this.closeDiscMenu,
      openDiscFromMenu: this.openDiscFromMenu, openRenameFromMenu: this.openRenameFromMenu, deleteFromMenu: this.deleteFromMenu,
      renameDisc, closeRename: this.closeRename, setRenameName: this.setRenameName, onRenameKey: this.onRenameKey, setRenameInput: this.setRenameInput, commitRename: this.commitRename,
      // cloud status (Conta)
      cloudUnavailable, cloudLoggedIn, cloudNeedsAuth,
      // auth / cloud
      authOpen: !!S.authScreen,
      authStageEmail: !!(S.authScreen && S.authScreen.stage === 'email'),
      authStageCode: !!(S.authScreen && S.authScreen.stage === 'code'),
      authEmail: S.authScreen ? (S.authScreen.email || '') : '',
      authCode: S.authScreen ? (S.authScreen.code || '') : '',
      authBtnLabel: (S.authScreen && S.authScreen.sending) ? 'Aguarde…' : ((S.authScreen && S.authScreen.stage === 'code') ? 'Entrar' : 'Enviar código'),
      authSentTo: 'Enviamos um código para ' + (S.authScreen ? (S.authScreen.email || '') : ''),
      setAuthEmail: this.setAuthEmail, setAuthCode: this.setAuthCode, onAuthKey: this.onAuthKey,
      authSubmit: () => { const a = this.state.authScreen; if (a && a.stage === 'code') this.verifyCode(); else this.sendCode(); },
      changeAuthEmail: this.changeAuthEmail,
      cloudOn: !!S.cloud, loggedIn: !!S.session, userEmail: S.session ? S.session.email : '', logout: this.logout,
      // toast
      toast: S.toast,
    };
  }
}
