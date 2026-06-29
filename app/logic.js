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

  state = {
    screen: 'biblioteca',
    activeDisc: null,
    prefs: { accent: null, serif: null, grid: null, showHints: true },
    pan: { x: 0, y: 0 }, zoom: 0.95, panning: false,
    selectedId: null, drag: null, gen: null, popover: null,
    hintOpen: true,
    reading: null, material: null, search: null, newDisc: null, toast: null,
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
    this.load();
  }
  componentWillUnmount() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.clearGenTimers();
    clearTimeout(this.tt);
    clearTimeout(this._pt);
    if (this.vp) this.vp.removeEventListener('wheel', this.onWheel);
  }

  // ---------- persistence (localStorage) ----------
  componentDidUpdate() { this.schedulePersist(); }
  schedulePersist() { clearTimeout(this._pt); this._pt = setTimeout(() => this.persist(), 400); }
  persist() {
    try {
      const S = this.state;
      const boards = { ...S.boards };
      if (S.screen === 'canvas' && S.activeDisc) boards[S.activeDisc] = { nodes: S.nodes, connections: S.connections };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        v: 1, disciplines: S.disciplines, boards, prefs: S.prefs,
        counters: { nidc: this.nidc, cid: this.cid },
      }));
    } catch (e) {}
  }
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) return;
      if (d.counters) { this.nidc = d.counters.nidc || 0; this.cid = d.counters.cid || 2; }
      this.setState({
        disciplines: Array.isArray(d.disciplines) ? d.disciplines : [],
        boards: d.boards && typeof d.boards === 'object' ? d.boards : {},
        prefs: { ...this.state.prefs, ...(d.prefs || {}) },
      });
    } catch (e) {}
  }
  resetAll = () => {
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
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
  setAiInput = (el) => { this.aiInput = el; if (el) setTimeout(() => { try { el.focus(); } catch (e) {} }, 20); };
  setSearchInput = (el) => { if (el) setTimeout(() => { try { el.focus(); } catch (e) {} }, 20); };
  setNewName = (el) => { this.newNameEl = el; if (el) setTimeout(() => { try { el.focus(); } catch (e) {} }, 20); };
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
    const patch = { selectedId: id };
    if (this.state.popover && this.state.popover.nodeId !== id) patch.popover = null;
    this.setState(patch);
  }

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
    this.setState({
      screen: 'canvas', activeDisc: id, boards,
      nodes: target.nodes, connections: target.connections,
      selectedId: null, popover: null, gen: null, drag: null,
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
      if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 3) g.moved = true;
      this.setState({ nodes: this.state.nodes.map(n => n.id === g.id ? { ...n, x: g.ox + dx, y: g.oy + dy } : n) });
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
      if (!g.moved) this.setState({ selectedId: null, popover: null });
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
    this.setState({ connections: [...this.state.connections, { id: 'c' + (++this.cid), from, to }] });
  }
  createNodeAt(wx, wy) {
    const id = 'n' + (++this.nidc);
    const node = { id, type: 'generated', x: wx - 150, y: wy - 78, w: 300, h: 156, filled: false, shortLabel: 'Novo nó' };
    this.setState({ nodes: [...this.state.nodes, node], selectedId: id });
    return id;
  }
  addNode = () => {
    const r = this.vp.getBoundingClientRect();
    const j = (this.nidc % 4) * 26;
    const w = this.screenToWorld(r.left + r.width * 0.5 + j, r.top + r.height * 0.7 + j);
    this.createNodeAt(w.x, w.y);
  };
  deleteNode(id) {
    const n = this.byId()[id];
    if (!n || n.locked) return;
    const patch = {
      nodes: this.state.nodes.filter(x => x.id !== id),
      connections: this.state.connections.filter(c => c.from !== id && c.to !== id),
      selectedId: null, popover: null,
    };
    if (this.state.gen && this.state.gen.nodeId === id) { this.clearGenTimers(); patch.gen = null; }
    this.setState(patch);
  }
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
      if (n.type === 'lesson') out.push((n.kicker ? n.kicker + ': ' : '') + (n.titleText || ''));
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
        const cnt = (n.questions || []).length;
        return { ...n, filled: true, w: 364, h: Math.max(220, 150 + cnt * 72) };
      }),
      gen: null,
    });
  }
  regen(id) {
    const node = this.byId()[id];
    const prompt = (node && node.lastPrompt) || '';
    this.setState({ nodes: this.state.nodes.map(n => n.id === id ? { ...n, filled: false, w: 300, h: 156 } : n) });
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
    const cnt = (node && node.questions) ? node.questions.length : 0;
    this.setState({ reading: { nodeId: id, resolved: Array(cnt).fill(false), reveal: Array(cnt).fill(false) } });
  };
  closeReading = () => this.setState({ reading: null });
  toggleResolve = (i) => { const r = this.state.reading; if (!r) return; const res = r.resolved.slice(); res[i] = !res[i]; this.setState({ reading: { ...r, resolved: res } }); };
  toggleReveal = (i) => { const r = this.state.reading; if (!r) return; const rv = r.reveal.slice(); rv[i] = !rv[i]; this.setState({ reading: { ...r, reveal: rv } }); };

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
    this.state.disciplines.forEach(d => {
      items.push({ type: 'DISC', title: d.name, context: (d.semester || '') + (d.aulas ? (' · ' + d.aulas + ' aulas') : ''), pick: () => { this.closeSearch(); this.openDiscipline(d.id); } });
      const board = this.state.boards[d.id];
      if (!board) return;
      board.nodes.filter(n => n.type === 'lesson').forEach(ls => {
        items.push({ type: 'AULA', title: ls.titleText, context: d.name + ' · ' + (ls.kicker || 'Aula'), pick: () => { this.closeSearch(); this.openDiscipline(d.id); setTimeout(() => this.openMaterial({ kicker: ls.kicker || 'Aula', title: ls.titleText, key: ls.lessonKey, meta: ls.material || 'material' }), 120); } });
      });
      board.nodes.filter(n => n.type === 'generated' && n.filled).forEach(gn => {
        items.push({ type: 'NÓ', title: gn.blockTitle || 'Bloco de Questões', context: d.name + ' · gerado', pick: () => { this.closeSearch(); this.openDiscipline(d.id); setTimeout(() => this.openReading(gn.id), 140); } });
      });
    });
    return items;
  }
  searchResults(q) {
    const nq = this.norm(q);
    if (!nq) return [];
    return this.searchItems().filter(it => this.norm(it.title).includes(nq) || this.norm(it.context).includes(nq)).slice(0, 8);
  }

  // ---------- new discipline ----------
  openNewDisc = () => this.setState({ newDisc: {} });
  closeNewDisc = () => this.setState({ newDisc: null });
  onNewKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.createDisc(); } else if (e.key === 'Escape') this.closeNewDisc(); };
  createDisc = () => {
    const name = (this.newNameEl && this.newNameEl.value.trim()) || 'Nova disciplina';
    const sem = (this.newSemEl && this.newSemEl.value.trim()) || this.IDENT.term;
    const id = 'd' + (++this.dynNum) + '-' + (this.nidc + this.cid);
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    const d = { id, name, num: roman[this.state.disciplines.length] || String(this.state.disciplines.length + 1), semester: sem, aulas: 0, h: 350 + (this.state.disciplines.length % 3) * 24, lessons: [] };
    const board = { nodes: [{ id: 't', type: 'title', x: -180, y: -86, w: 360, h: 172, locked: true, shortLabel: name, titleBig: name, titleMeta: sem + ' · quadro novo', kickerLabel: 'Disciplina' }], connections: [] };
    const boards = { ...this.state.boards, [id]: board };
    this.setState({
      disciplines: [...this.state.disciplines, d], boards, newDisc: null,
      screen: 'canvas', activeDisc: id, nodes: board.nodes, connections: board.connections,
      selectedId: null, popover: null, gen: null, drag: null, hintOpen: this.state.prefs.showHints,
    });
    this.clearGenTimers();
    requestAnimationFrame(() => this.fitView());
    setTimeout(() => { this.fitView(); this.toast('Quadro criado — toque duplo no papel para criar um nó'); }, 80);
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
      if (this.state.newDisc) return this.closeNewDisc();
      if (this.state.material) return this.closeMaterial();
      if (this.state.reading) return this.closeReading();
      if (this.state.popover) return this.closePopover();
      if (this.state.selectedId) return this.setState({ selectedId: null });
      return;
    }
    if (typing) return;
    if ((e.key === 'Backspace' || e.key === 'Delete') && this.state.selectedId && this.state.screen === 'canvas') {
      e.preventDefault(); this.deleteNode(this.state.selectedId);
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
      active: d.id === S.activeDisc, normal: d.id !== S.activeDisc, ghost: false,
      onOpen: () => this.openDiscipline(d.id),
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
      });
    });
    const footerStats = S.disciplines.length + ' disciplinas · ' + lessonCount + ' aulas · ' + nodeCount + ' nós';

    // canvas lines + nodes
    const lines = S.connections.map(cn => {
      const A = byId[cn.from], B = byId[cn.to];
      if (!A || !B) return null;
      const ca = center(A), cb = center(B);
      const pa = this.edge(A, cb.x, cb.y), pb = this.edge(B, ca.x, ca.y);
      const sel = S.selectedId && (cn.from === S.selectedId || cn.to === S.selectedId);
      return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: sel ? accent : 'rgba(33,30,26,0.5)' };
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
      const v = {
        id: n.id, x: n.x, y: n.y, w: n.w,
        isTitle: n.type === 'title', isLesson: n.type === 'lesson',
        kicker: n.kicker, titleText: n.titleText, material: n.material,
        kickerLabel: n.kickerLabel, titleBig: n.titleBig, titleMeta: n.titleMeta,
        blockTitle: n.blockTitle || 'Bloco de Questões',
        selected: S.selectedId === n.id,
        isOver: !!(S.drag && S.drag.overId === n.id),
        connectedLabel,
        connLine: hasConn ? ('●  lê de — ' + connectedLabel) : '○  nenhum nó conectado',
        genEmpty: false, genResult: false, filled: false, showStatus: false, statusText: '', resultKicker: '', shownLines: [],
        onDown: (e) => this.nodeDown(e, n.id),
        onHandleDown: (e) => this.handleDown(e, n.id),
        onAi: (e) => { this.stop(e); this.openPopover(n.id); },
        onSkip: () => this.skipTyping(n.id),
        onRegen: (e) => { this.stop(e); this.regen(n.id); },
        onOpen: (e) => { if (e) this.stop(e); this.openReading(n.id); },
        onMaterial: (e) => { this.stop(e); this.openMaterial({ kicker: n.kicker, title: n.titleText, key: n.lessonKey, meta: n.material }); },
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
        };
      });
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

    // accent swatches + serif options
    const accentSwatches = [
      { color: '#7A1F2B', label: 'Oxblood' }, { color: '#2E3A2C', label: 'Verde-folha' },
      { color: '#243043', label: 'Azul-tinta' }, { color: '#5A3A22', label: 'Sépia' },
    ].map(sw => ({ ...sw, selected: this.curAccent() === sw.color, onPick: () => this.setPref('accent', sw.color) }));
    const curSerifName = this.curSerif();
    const serifOptions = [
      { short: 'Cormorant', full: 'Cormorant Garamond' }, { short: 'Plex Serif', full: 'IBM Plex Serif' },
    ].map((o, i) => ({ short: o.short, bg: curSerifName === o.full ? accent : 'transparent', fg: curSerifName === o.full ? '#FFFDF8' : 'rgba(33,30,26,0.7)', sep: i === 0 ? 'none' : '1px solid rgba(33,30,26,0.18)', onPick: () => this.setPref('serif', o.full) }));

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
      lines, dragLine, nodes,
      zoomPct: Math.round(S.zoom * 100) + '%',
      zoomIn: () => this.zoomBy(1.2), zoomOut: () => this.zoomBy(1 / 1.2), resetView: this.fitView,
      addNode: this.addNode, cornerAi: this.cornerAi,
      hintOpen: S.screen === 'canvas' && S.hintOpen && this.curHints(),
      hintClosed: S.screen === 'canvas' && !(S.hintOpen && this.curHints()),
      dismissHint: () => this.setState({ hintOpen: false }), openHint: () => this.setState({ hintOpen: true }),
      // popover
      popover, setAiInput: this.setAiInput, onPopInput: this.onPopInput, onPopKey: this.onPopKey, closePopover: this.closePopover, submitGen: this.submitGen,
      // reading
      reading, readingQs, readProgressW, readProgressLabel, readingKicker, readingTitle, readingMeta, closeReading: this.closeReading,
      truthHead, truthCells,
      // material
      material, matPage, matThumbs, closeMaterial: this.closeMaterial,
      // search
      search, searchEmpty, searchHasResults, searchNoResults, searchResults, suggestions,
      setSearchInput: this.setSearchInput, onSearchInput: this.onSearchInput, onSearchKey: this.onSearchKey, closeSearch: this.closeSearch,
      // new disc
      newDisc: S.newDisc ? true : null, closeNewDisc: this.closeNewDisc, createDisc: this.createDisc, onNewKey: this.onNewKey, setNewName: this.setNewName, setNewSem: this.setNewSem,
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
      // toast
      toast: S.toast,
    };
  }
}
