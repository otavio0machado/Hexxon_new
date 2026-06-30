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
    selectedId: null, selectedConnId: null, drag: null, gen: null, popover: null,
    hintOpen: true,
    reading: null, material: null, search: null, newDisc: null, toast: null, flash: null,
    discMenu: null, renameDisc: null, noteEdit: null, pdfView: null,
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
    this.initCloud();
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
    if (this.vp) this.vp.removeEventListener('wheel', this.onWheel);
  }

  // ---------- persistence (localStorage) ----------
  componentDidUpdate() { this.schedulePersist(); }
  schedulePersist() { clearTimeout(this._pt); this._pt = setTimeout(() => this.persist(), 400); }
  snapshot() {
    const S = this.state;
    const boards = { ...S.boards };
    if (S.screen === 'canvas' && S.activeDisc) boards[S.activeDisc] = { nodes: S.nodes, connections: S.connections };
    return { v: 1, disciplines: S.disciplines, boards, prefs: S.prefs, counters: { nidc: this.nidc, cid: this.cid } };
  }
  persist() {
    const snap = this.snapshot();
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(snap)); } catch (e) {}
    if (this.state.cloud && this.session && this.sb) this.pushCloud(snap);
  }
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
    let row = null;
    try { const { data } = await this.sb.from('sdn_state').select('data').eq('user_id', this.session.user.id).maybeSingle(); row = data; } catch (e) {}
    if (row && row.data && row.data.v === 1) { this.applySnapshot(row.data); return; }
    // no cloud row yet — migrate local data if present, else start empty
    let local = null;
    try { const raw = localStorage.getItem(this.STORAGE_KEY); if (raw) { const d = JSON.parse(raw); if (d && d.v === 1 && (d.disciplines || []).length) local = d; } } catch (e) {}
    if (local) { this.applySnapshot(local); this.pushCloud(local); this.toast('Seus dados locais foram enviados para a nuvem'); }
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
      if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 3 && !g.moved) { g.moved = true; this.pushHist(); }
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
  createNodeAt(wx, wy) {
    this.pushHist();
    const id = 'n' + (++this.nidc);
    const node = { id, type: 'generated', x: wx - 150, y: wy - 78, w: 300, h: 156, filled: false, shortLabel: 'Novo nó' };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
    return id;
  }
  addNode = () => {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 26;
    const w = this.screenToWorld(r.left + r.width * 0.5 + j, r.top + r.height * 0.7 + j);
    this.createNodeAt(w.x, w.y);
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
    const node = { id, type: 'note', x: w.x - 140, y: w.y - 96, w: 280, h: 196, title: title || 'Nota', content: content || '', source: source || 'texto', shortLabel: (title || 'Nota').slice(0, 18) };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
    return id;
  }
  setNoteContent(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, content: val } : n) }); }
  setNoteTitle(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, title: val, shortLabel: (val || 'Nota').slice(0, 18) } : n) }); }

  // ---------- Notion-style note editor (full-screen) ----------
  openNoteEditor = (id) => { const n = this.byId()[id]; if (!n || n.type !== 'note') return; this.setState({ noteEdit: { id, mode: 'edit' }, selectedId: id }); };
  closeNoteEditor = () => this.setState({ noteEdit: null });
  toggleNotePreview = () => { const e = this.state.noteEdit; if (e) this.setState({ noteEdit: { ...e, mode: e.mode === 'preview' ? 'edit' : 'preview' } }); };
  setNoteBodyRef = (el) => { this.autoFocus(el); };
  // tiny markdown: # / ## headings, - bullets, **bold** inline
  mdInline(text) {
    text = text || '';
    if (text.indexOf('**') < 0) return text; // plain string (no key warnings)
    const R = window.React; const out = []; const re = /\*\*([^*]+)\*\*/g; let m, last = 0, k = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(R.createElement('span', { key: 't' + (k++) }, text.slice(last, m.index)));
      out.push(R.createElement('strong', { key: 'b' + (k++) }, m[1])); last = m.index + m[0].length;
    }
    if (last < text.length) out.push(R.createElement('span', { key: 't' + (k++) }, text.slice(last)));
    return out;
  }
  mdBlocks(text) {
    return (text || '').split('\n').map((raw, idx) => {
      const t = raw.replace(/\s+$/, '');
      let kind = 'p', body = t;
      if (/^#\s+/.test(t)) { kind = 'h1'; body = t.replace(/^#\s+/, ''); }
      else if (/^##\s+/.test(t)) { kind = 'h2'; body = t.replace(/^##\s+/, ''); }
      else if (/^[-*]\s+/.test(t)) { kind = 'li'; body = t.replace(/^[-*]\s+/, ''); }
      else if (t.trim() === '') kind = 'sp';
      return { key: idx, kind, content: this.mdInline(body), isH1: kind === 'h1', isH2: kind === 'h2', isLi: kind === 'li', isP: kind === 'p', isSp: kind === 'sp' };
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
  async idbPut(key, blob) { const db = await this.idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  async idbGet(key) { try { const db = await this.idb(); return await new Promise((res) => { const tx = db.transaction('files', 'readonly'); const r = tx.objectStore('files').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } }
  async idbDel(key) { try { const db = await this.idb(); const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(key); } catch (e) {} }
  async idbClear() { try { const db = await this.idb(); const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').clear(); } catch (e) {} }
  delBoardFiles(board) { try { (board && board.nodes || []).forEach(n => { if (n.type === 'pdf') this.idbDel(n.id); }); } catch (e) {} }

  onPdfPick = (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (this.state.screen !== 'canvas' || !this.vp) { this.toast('Abra um quadro para importar o PDF'); return; }
    const id = 'n' + (++this.nidc);
    this.createPdfNode(id, file.name, '');        // node appears immediately (viewable)
    this.idbPut(id, file).catch(() => {});         // store the file locally
    this.toast('PDF adicionado — abra para ver ou conecte (●) à IA');
    // extract text in the background so the AI can use it as context
    this.extractPdf(file)
      .then((text) => { if (text) this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, content: text } : n) }); })
      .catch(() => {});
  };
  createPdfNode(id, filename, text) {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 24;
    const w = this.screenToWorld(r.left + r.width * 0.4 + j, r.top + r.height * 0.42 + j);
    this.pushHist();
    const node = { id, type: 'pdf', x: w.x - 150, y: w.y - 72, w: 300, h: 150, filename: filename || 'documento.pdf', content: text || '', source: 'pdf', hasFile: true, shortLabel: (filename || 'PDF').replace(/\.pdf$/i, '').slice(0, 18) };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
  }
  openPdf = async (id) => {
    const n = this.byId()[id]; if (!n) return;
    this.setState({ pdfView: { id, filename: n.filename || 'documento.pdf', url: null, missing: false, loading: true } });
    const blob = await this.idbGet(id);
    if (!blob) { this.setState({ pdfView: { id, filename: n.filename || 'documento.pdf', url: null, missing: true, loading: false } }); return; }
    if (this._pdfUrl) { try { URL.revokeObjectURL(this._pdfUrl); } catch (e) {} }
    this._pdfUrl = URL.createObjectURL(blob);
    this.setState({ pdfView: { id, filename: n.filename || 'documento.pdf', url: this._pdfUrl, missing: false, loading: false } });
  };
  closePdf = () => { if (this._pdfUrl) { try { URL.revokeObjectURL(this._pdfUrl); } catch (e) {} this._pdfUrl = null; } this.setState({ pdfView: null }); };
  downloadPdf = () => { const v = this.state.pdfView; if (v && v.url) { const a = document.createElement('a'); a.href = v.url; a.download = v.filename || 'documento.pdf'; a.click(); } };

  // ---------- image nodes (your own diagrams / prints) ----------
  pickImage = () => { if (this.imgInput) this.imgInput.click(); };
  setImgInput = (el) => { this.imgInput = el; };
  // downscale to keep localStorage small: max 1280px on the long edge, JPEG q≈0.82
  downscaleImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1280;
          let { width: w, height: h } = img;
          const scale = Math.min(1, MAX / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          const transparent = /png|gif|webp/i.test(file.type);
          const out = transparent ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82);
          URL.revokeObjectURL(url);
          resolve({ src: out, w, h });
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
    if (data.src.length > 2400000) this.toast('Imagem grande — pode pesar no armazenamento');
    this.createImage(data.src, data.w, data.h, caption || (file.name || '').replace(/\.[a-z]+$/i, ''));
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
  createImage(src, iw, ih, caption) {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 24;
    const wld = this.screenToWorld(r.left + r.width * 0.42 + j, r.top + r.height * 0.40 + j);
    const w = 300, h = Math.round(Math.max(140, Math.min(360, w * (ih / Math.max(1, iw)) + 38)));
    this.pushHist();
    const id = 'n' + (++this.nidc);
    const node = { id, type: 'image', x: wld.x - w / 2, y: wld.y - h / 2, w, h, src, caption: caption || '', shortLabel: (caption || 'Imagem').slice(0, 18) };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id, selectedConnId: null });
    this.toast('Imagem adicionada');
    return id;
  }
  setImageCaption(id, val) { this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, caption: val, shortLabel: (val || 'Imagem').slice(0, 18) } : n) }); }

  deleteNode(id) {
    const n = this.byId()[id];
    if (!n || n.locked) return;
    if (n.type === 'pdf') this.idbDel(id);
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
  openPopover(id) { this.setState({ selectedId: id, popover: { nodeId: id, text: '' } }); }
  closePopover = () => this.setState({ popover: null });
  onPopInput = (e) => { const p = this.state.popover; if (p) this.setState({ popover: { ...p, text: e.target.value } }); };
  onPopKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submitGen(); }
    else if (e.key === 'Escape') this.closePopover();
  };
  submitGen = () => { const p = this.state.popover; const id = p && p.nodeId; const text = p ? p.text : ''; this.closePopover(); if (id) this.startGen(id, text); };

  // Collect text context from the nodes connected to `id` to ground the AI.
  gatherContext(id) {
    const byId = this.byId();
    const neigh = this.state.connections.filter(c => c.from === id || c.to === id).map(c => byId[c.from === id ? c.to : c.from]).filter(Boolean);
    const out = [];
    neigh.forEach(n => {
      if ((n.type === 'note' || n.type === 'pdf') && (n.content || '').trim()) { const lbl = n.title || n.filename; out.push('Material' + (lbl ? ' [' + lbl + ']' : '') + ':\n' + n.content.trim().slice(0, 12000)); }
      else if (n.type === 'image' && (n.caption || '').trim()) out.push('Imagem [' + n.caption.trim() + ']');
      else if (n.type === 'lesson') out.push((n.kicker ? n.kicker + ': ' : '') + (n.titleText || ''));
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
  openFlash = (id) => {
    const node = this.byId()[id];
    const qs = (node && node.questions) || [];
    if (!qs.length) { this.toast('Gere questões primeiro'); return; }
    this.setState({ flash: { deck: qs.map((q, qi) => ({ nodeId: id, qi })), idx: 0, flipped: false, title: node.blockTitle || 'Bloco de Questões' } });
  };
  reviewAll = () => {
    const deck = [];
    this.state.nodes.forEach(n => {
      if (n.type === 'generated' && n.filled) (n.questions || []).forEach((q, qi) => deck.push({ nodeId: n.id, qi }));
    });
    if (!deck.length) { this.toast('Nenhuma questão gerada ainda neste quadro'); return; }
    this.setState({ flash: { deck, idx: 0, flipped: false, title: 'Revisão geral' } });
  };
  closeFlash = () => this.setState({ flash: null });
  flipCard = () => { const f = this.state.flash; if (f) this.setState({ flash: { ...f, flipped: !f.flipped } }); };
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
      ((q.solution && q.solution.length) ? '<div class="sol"><div class="lbl">Resolução</div>' + q.solution.map(s => '<p>' + esc(s) + '</p>').join('') + '<p class="ans">→ ' + esc(q.answer) + '</p></div>' : '') + '</div>').join('');
    const title = esc(node.blockTitle || 'Bloco de Questões');
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      '*{box-sizing:border-box}body{font-family:Georgia,serif;color:#211E1A;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.5}' +
      'h1{font-size:28px;margin:0 0 4px}.meta{font-family:ui-monospace,monospace;font-size:11px;color:#666;margin-bottom:24px;text-transform:uppercase;letter-spacing:.08em}' +
      '.q{padding:16px 0;border-bottom:1px solid #ddd;break-inside:avoid}.qh{display:flex;gap:12px}.n{color:#7A1F2B;font-weight:bold;font-size:18px}.t{font-size:15px}' +
      '.sol{margin:10px 0 0 34px;padding:10px 14px;background:#f6f4ef;border-left:2px solid #7A1F2B}.lbl{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7A1F2B;margin-bottom:6px}' +
      '.sol p{margin:0 0 6px;font-size:13px}.ans{color:#7A1F2B;font-weight:bold}@media print{body{margin:0}}' +
      '</style></head><body><h1>' + title + '</h1><div class="meta">' + esc(disc ? disc.name : '') + ' · ' + qs.length + ' questões</div>' + rows +
      '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},250)}</scr' + 'ipt></body></html>';
    const w = window.open('', '_blank');
    if (!w) { this.toast('Permita pop-ups para exportar o PDF'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---------- material ----------
  openMaterial = (info) => { this.setState({ material: { ...info, page: 0 } }); };
  closeMaterial = () => this.setState({ material: null });
  setMatPage = (i) => { const m = this.state.material; if (m) this.setState({ material: { ...m, page: i } }); };

  matPages(m) {
    return [
      { kind: 'def', eyebrow: 'Visão geral', title: m.title, intro: 'Material da aula. Conecte este nó a um nó de geração para usá-lo como contexto para a IA.', hasBullets: true, bullets: ['Definições e notação', 'Exemplos resolvidos', 'Exercícios propostos'] },
      { kind: 'placeholder', caption: 'slide · anotações de aula' },
      { kind: 'refs' },
    ];
  }

  // ---------- search ----------
  openSearch = () => this.setState({ search: { q: '' } });
  closeSearch = () => this.setState({ search: null });
  onSearchInput = (e) => this.setState({ search: { q: e.target.value } });
  onSearchKey = (e) => { if (e.key === 'Escape') this.closeSearch(); else if (e.key === 'Enter') { const r = this.searchResults(this.state.search.q); if (r[0]) r[0].pick(); } };
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
    const sem = (this.newSemEl && this.newSemEl.value.trim()) || this.IDENT.term;
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
    }
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
        pdfMeta: (n.content || '').trim() ? 'PDF · texto disponível para a IA' : 'PDF · documento',
        onOpenPdf: (e) => { this.stop(e); this.openPdf(n.id); },
        genBodyCss, cardCss,
        resizable,
        selected: S.selectedId === n.id,
        isOver: !!(S.drag && S.drag.overId === n.id),
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
        onMaterial: (e) => { this.stop(e); this.openMaterial({ kicker: n.kicker, title: n.titleText, key: n.lessonKey, meta: n.material }); },
        onNoteInput: (e) => this.setNoteContent(n.id, e.target.value),
        onNoteTitleInput: (e) => this.setNoteTitle(n.id, e.target.value),
        onExpandNote: (e) => { this.stop(e); this.openNoteEditor(n.id); },
        onImgCaption: (e) => this.setImageCaption(n.id, e.target.value),
        onTitleRename: (e) => this.renameTitle(n.id, e.target.value),
      };
      if (isGen) {
        v.genEmpty = !filled && !genHere;
        v.genResult = genHere || filled;
        v.filled = filled;
        v.showStatus = genHere && S.gen.phase === 'reading';
        v.statusText = genHere ? S.gen.statusText : '';
        v.resultKicker = filled ? ('Gerado · ' + qs.length + ' quest' + (qs.length === 1 ? 'ão' : 'ões')) : 'Gerando';
        v.shownLines = filled ? qs.map(q => ({ n: q.n, text: q.text, caret: false })) : (genHere && S.gen.phase === 'typing' ? this.computeShown(S.gen.shown, qs) : []);
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
        popover = { left, top, text: S.popover.text, chips: neigh.map(x => x.shortLabel), empty: neigh.length === 0 };
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
        let left = Math.max(12, Math.min(sx, r.width - 188));
        let top = 54 + sy - 42;
        if (top < 62) top = 54 + sy + n.h * S.zoom + 10;
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
          num: q.n, text: q.text,
          resolved, revealed,
          checkBorder: resolved ? accent : 'rgba(33,30,26,0.3)',
          checkBg: resolved ? accent : 'transparent',
          checkMark: resolved ? '✓' : '',
          resolveColor: resolved ? accent : 'rgba(33,30,26,0.5)',
          resolveLabel: resolved ? 'resolvida' : 'marcar resolvida',
          revealLabel: revealed ? 'ocultar resolução' : 'ver resolução',
          solution: q.solution || [], hasTable: false, answer: q.answer || '',
          onResolve: () => this.toggleResolve(i),
          onReveal: () => this.toggleReveal(i),
          onDelete: () => this.deleteQuestion(i),
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
        flashNum = fq.n; flashText = fq.text; flashSolution = fq.solution || []; flashAnswer = fq.answer || '';
        flashFront = !S.flash.flipped; flashBack = !!S.flash.flipped;
        flashCount = (S.flash.idx + 1) + ' / ' + S.flash.deck.length;
        flashFrom = (S.flash.title === 'Revisão geral' && fnode) ? (fnode.blockTitle || 'Bloco de Questões') : '';
      }
    }

    // truth table flat cells (kept for the material viewer)
    const truthHead = this.TRUTH.head;
    const truthCells = [].concat.apply([], this.TRUTH.rows);

    // material
    let material = null, matPage = {}, matThumbs = [];
    if (S.material) {
      const pages = this.matPages(S.material);
      const cur = Math.min(S.material.page, pages.length - 1);
      const p = pages[cur] || {};
      material = { kicker: S.material.kicker || 'Aula', title: S.material.title || '', meta: 'material · ' + pages.length + ' págs' };
      matPage = {
        isDef: p.kind === 'def', isTable: p.kind === 'table', isPlaceholder: p.kind === 'placeholder', isRefs: p.kind === 'refs',
        eyebrow: p.eyebrow || '', title: p.title || '', intro: p.intro || '', note: p.note || '', caption: p.caption || '',
        hasTerms: !!p.hasTerms, terms: p.terms || [], hasBullets: !!p.hasBullets, bullets: p.bullets || [],
        refs: [{ n: '01', text: 'Adicione aqui as referências da aula.' }, { n: '02', text: 'Notas de aula.' }, { n: '03', text: 'Lista de exercícios.' }],
      };
      matThumbs = pages.map((pg, i) => ({ n: 'pág ' + (i + 1), active: i === cur, border: i === cur ? accent : 'rgba(33,30,26,0.16)', numColor: i === cur ? accent : 'rgba(33,30,26,0.45)', onPick: () => this.setMatPage(i) }));
    }

    // search
    let search = null, searchEmpty = false, searchHasResults = false, searchNoResults = false, searchResults = [], suggestions = [];
    if (S.search) {
      search = { q: S.search.q };
      const q = S.search.q;
      if (!this.norm(q)) {
        searchEmpty = true;
        suggestions = S.disciplines.slice(0, 5).map(d => ({ text: d.name, onPick: () => this.setState({ search: { q: d.name } }) }));
      } else {
        const res = this.searchResults(q);
        searchResults = res.map(r => ({ type: r.type, title: r.title, context: r.context, onPick: r.pick }));
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
        };
      } else { noteEdit = null; }
    }

    // pdf viewer overlay
    const pdfView = S.pdfView ? {
      filename: S.pdfView.filename || 'documento.pdf',
      url: S.pdfView.url || '', hasUrl: !!S.pdfView.url,
      missing: !!S.pdfView.missing, loading: !!S.pdfView.loading,
    } : null;

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
      if (d) discMenu = { name: d.name, meta: (d.semester || '') + (d.aulas ? (' · ' + d.aulas + ' aulas') : '') };
    }
    const renameDisc = S.renameDisc ? { name: S.renameDisc.name || '' } : null;

    // cloud / account status (for the Conta screen)
    const cloudUnavailable = !S.cloud;
    const cloudLoggedIn = !!(S.cloud && S.session);
    const cloudNeedsAuth = !!(S.cloud && !S.session);

    // identity
    const ident = this.IDENT;

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
      pdfView, closePdf: this.closePdf, downloadPdf: this.downloadPdf,
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
      reviewAll: this.reviewAll, hasReview: S.nodes.some(n => n.type === 'generated' && n.filled),
      truthHead, truthCells,
      // material
      material, matPage, matThumbs, closeMaterial: this.closeMaterial,
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
      statDisc: String(S.disciplines.length), statNos: String(nodeCount), statGer: String(genCount),
      accentSwatches, serifOptions,
      gridTrack: grid ? accent : 'transparent', gridKnob: grid ? '22px' : '2px',
      hintsTrack: this.curHints() ? accent : 'transparent', hintsKnob: this.curHints() ? '22px' : '2px',
      toggleGrid: this.toggleGrid, toggleHints: this.toggleHints, resetAll: this.resetAll,
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
