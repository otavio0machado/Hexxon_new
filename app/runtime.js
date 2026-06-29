/* ============================================================================
   dc-lite — a compact, self-contained renderer for this Design Component.
   Implements the exact template DSL the design uses (a faithful subset of the
   dc-runtime): {{ path }} interpolation, <sc-if>, <sc-for>, inline style
   strings, style-hover / style-focus pseudo-classes, ref callbacks, and
   camelCase DOM events. Template + logic below are kept verbatim from the
   imported "Sandbox de Nós.dc.html".
   ============================================================================ */
(function () {
  "use strict";
  var React = window.React, ReactDOM = window.ReactDOM;
  var h = React.createElement;

  /* ---- expression resolver: {{ a.b[c] }}, ===/!==, !x, literals ---- */
  var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  var NUMBER_RE = /^-?\d+(\.\d+)?$/;
  function resolve(vals, srcExpr) {
    var expr = String(srcExpr).trim();
    if (!expr) return undefined;
    if (expr[0] === "(" && expr[expr.length - 1] === ")" && parensWrapWhole(expr)) return resolve(vals, expr.slice(1, -1));
    var eq = findTopLevelEquality(expr);
    if (eq) {
      var lv = resolve(vals, expr.slice(0, eq.index));
      var rv = resolve(vals, expr.slice(eq.index + eq.op.length));
      switch (eq.op) { case "===": return lv === rv; case "!==": return lv !== rv; case "==": return lv == rv; default: return lv != rv; }
    }
    if (expr[0] === "!") return !resolve(vals, expr.slice(1));
    if (expr === "true") return true;
    if (expr === "false") return false;
    if (expr === "null") return null;
    if (expr === "undefined") return undefined;
    if (NUMBER_RE.test(expr)) return Number(expr);
    if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) return expr.slice(1, -1);
    return resolvePath(vals, expr);
  }
  function parensWrapWhole(expr) { var d = 0; for (var i = 0; i < expr.length - 1; i++) { if (expr[i] === "(") d++; else if (expr[i] === ")") { d--; if (d === 0) return false; } } return true; }
  function findTopLevelEquality(expr) {
    var d = 0;
    for (var i = 0; i < expr.length; i++) {
      var c = expr[i];
      if (c === "[" || c === "(") d++;
      else if (c === "]" || c === ")") d--;
      else if (d === 0 && (c === "=" || c === "!") && expr[i + 1] === "=") {
        if (i > 0 && (expr[i - 1] === "=" || expr[i - 1] === "!")) continue;
        if (!expr.slice(0, i).trim()) continue;
        var op = expr[i + 2] === "=" ? c + "==" : c + "=";
        return { index: i, op: op };
      }
    }
    return null;
  }
  function resolvePath(vals, expr) {
    var head = expr.match(IDENT_RE);
    if (!head) return undefined;
    var cur = vals == null ? undefined : vals[head[0]];
    var i = head[0].length;
    while (i < expr.length) {
      if (expr[i] === ".") {
        var m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
        if (!m) return undefined;
        cur = cur == null ? undefined : cur[m[0]];
        i += 1 + m[0].length;
      } else if (expr[i] === "[") {
        var depth = 1, j = i + 1;
        while (j < expr.length && depth > 0) { if (expr[j] === "[") depth++; else if (expr[j] === "]") { depth--; if (depth === 0) break; } j++; }
        if (depth !== 0) return undefined;
        var key = resolve(vals, expr.slice(i + 1, j));
        cur = cur == null ? undefined : cur[key];
        i = j + 1;
      } else return undefined;
    }
    return cur;
  }

  /* ---- attribute value compiler ---- */
  function compileAttr(raw) {
    var whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) { var path = whole[1]; return function (vals) { return resolve(vals, path); }; }
    if (raw.indexOf("{{") >= 0) {
      var parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
      return function (vals) {
        var out = "";
        for (var i = 0; i < parts.length; i++) {
          if (i & 1) { var v = resolve(vals, parts[i]); out += (v === null || v === undefined) ? "" : v; }
          else out += parts[i];
        }
        return out;
      };
    }
    return function () { return raw; };
  }

  /* ---- css + case helpers ---- */
  function kebabToCamel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
  function cssToObj(css) {
    var o = {}, decls = css.split(";");
    for (var k = 0; k < decls.length; k++) {
      var decl = decls[k], i = decl.indexOf(":");
      if (i < 0) continue;
      var prop = decl.slice(0, i).trim();
      if (!prop) continue;
      o[prop.indexOf("--") === 0 ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
    }
    return o;
  }
  var CAMEL_ATTR = "sc-camel-";
  var CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;
  function encodeCase(html) {
    // preserve camelCase attribute names through the HTML parser (which lowercases),
    // and tag <helmet> so the runtime can route it to <head>.
    html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1").replace(/<\/helmet\s*>/gi, "</sc-helmet>");
    html = html.replace(CAMEL_ATTR_RE, function (_, sp, name, eq) {
      return sp + CAMEL_ATTR + name.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }) + eq;
    });
    return html;
  }

  /* ---- pseudo-class stylesheet for style-hover / style-focus ---- */
  var pseudoClass = (function () {
    var el = null, cache = {}, n = 0;
    return function (pseudo, css) {
      var key = pseudo + "|" + css;
      if (cache[key]) return cache[key];
      if (!el) { el = document.createElement("style"); document.head.appendChild(el); }
      var cls = "scp" + (n++).toString(36);
      var sel = (pseudo === "before" || pseudo === "after") ? "." + cls + "::" + pseudo : "." + cls + ":" + pseudo;
      el.sheet.insertRule(sel + "{" + css + "}", el.sheet.cssRules.length);
      cache[key] = cls;
      return cls;
    };
  })();

  /* ---- template compiler ---- */
  function compileTemplate(html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = encodeCase(html);
    var builders = walkChildren(tpl.content);
    return function (vals) { return builders.map(function (b, i) { return b(vals || {}, i); }); };
  }
  function walkChildren(node) {
    var out = [], cs = node.childNodes;
    for (var i = 0; i < cs.length; i++) { var b = walk(cs[i]); if (b != null) out.push(b); }
    return out;
  }
  function walk(node) {
    if (node.nodeType === 3) return walkText(node);
    if (node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    if (tag === "sc-for") return walkFor(node);
    if (tag === "sc-if") return walkIf(node);
    if (tag === "sc-helmet") return function () { return null; }; // static head content already in <head>
    return walkElement(node);
  }
  function walkText(node) {
    var txt = node.nodeValue || "";
    if (txt.indexOf("{{") < 0) {
      if (!txt.trim() && txt.indexOf(" ") < 0) return null;
      return function () { return txt; };
    }
    var parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
    return function (vals, key) {
      var kids = [];
      for (var i = 0; i < parts.length; i++) {
        if (!(i & 1)) { kids.push(parts[i]); continue; }
        var v = resolve(vals, parts[i]);
        if (v === undefined) { kids.push(null); continue; }
        if (React.isValidElement(v) || Array.isArray(v)) { kids.push(h(React.Fragment, { key: i }, v)); continue; }
        if (v === null || typeof v === "boolean") { kids.push(null); continue; }
        kids.push(h("span", { key: i, className: "sc-interp" }, String(v)));
      }
      return h(React.Fragment, { key: key }, kids);
    };
  }
  function walkFor(el) {
    var listGet = compileAttr(el.getAttribute("list") || "");
    var asName = el.getAttribute("as") || "item";
    var kids = walkChildren(el);
    return function (vals, key) {
      var list = listGet(vals);
      if (!Array.isArray(list)) list = [];
      return h(React.Fragment, { key: key }, list.map(function (item, i) {
        var sub = Object.assign({}, vals);
        sub[asName] = item; sub.$index = i;
        return h(React.Fragment, { key: i }, kids.map(function (b, j) { return b(sub, j); }));
      }));
    };
  }
  function walkIf(el) {
    var valGet = compileAttr(el.getAttribute("value") || "");
    var kids = walkChildren(el);
    return function (vals, key) {
      return valGet(vals) ? h(React.Fragment, { key: key }, kids.map(function (b, j) { return b(vals, j); })) : null;
    };
  }
  var EVENT_MAP = { onclick: "onClick", onchange: "onChange", oninput: "onInput", onsubmit: "onSubmit", onkeydown: "onKeyDown", onkeyup: "onKeyUp", onkeypress: "onKeyPress", onmousedown: "onMouseDown", onmouseup: "onMouseUp", onmouseenter: "onMouseEnter", onmouseleave: "onMouseLeave", onfocus: "onFocus", onblur: "onBlur", ondoubleclick: "onDoubleClick", oncontextmenu: "onContextMenu" };
  function collectProps(el) {
    var getters = [], pseudo = [], attrs = el.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name, value = attrs[a].value, key = name;
      if (key.indexOf(CAMEL_ATTR) === 0) key = kebabToCamel(key.slice(CAMEL_ATTR.length));
      if (key === "hint-size" || key.indexOf("hint-placeholder") === 0) continue;
      if (key.indexOf("style-") === 0) { pseudo.push(pseudoClass(key.slice(6), value)); continue; }
      if (key === "class") key = "className";
      else if (key === "for") key = "htmlFor";
      else if (key.indexOf("on") === 0) key = EVENT_MAP[key.toLowerCase()] || ("on" + key[2].toUpperCase() + key.slice(3));
      getters.push([key, compileAttr(value)]);
    }
    return { getters: getters, pseudo: pseudo };
  }
  function walkElement(el) {
    var tag = el.localName;
    var cp = collectProps(el);
    var kids = walkChildren(el);
    return function (vals, key) {
      var props = { key: key };
      for (var g = 0; g < cp.getters.length; g++) {
        var k = cp.getters[g][0], v = cp.getters[g][1](vals);
        if (k === "style" && typeof v === "string") v = cssToObj(v);
        if ((k === "value" || k === "checked") && v === undefined) v = (k === "checked" ? false : "");
        props[k] = v;
      }
      if (cp.pseudo.length) props.className = [props.className].concat(cp.pseudo).filter(Boolean).join(" ");
      return h.apply(null, [tag, props].concat(kids.map(function (b, j) { return b(vals, j); })));
    };
  }

  /* ---- logic base class (the design's `DCLogic`) ---- */
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; this.__host = null; }
    setState(u, cb) { if (this.__host) this.__host.__set(u, cb); }
    forceUpdate() { if (this.__host) this.__host.forceUpdate(); }
    componentDidMount() {}
    componentDidUpdate() {}
    componentWillUnmount() {}
    renderVals() { return {}; }
  }

  /* ---- React host: drives a DCLogic instance against the compiled template ---- */
  function makeHost(LogicClass, tpl) {
    return class DCHost extends React.Component {
      constructor(props) { super(props); this.state = { __v: 0 }; this.logic = new LogicClass(props); this.logic.__host = this; }
      __set(update, cb) {
        var prev = this.logic.state;
        var patch = (typeof update === "function") ? update(prev) : update;
        this.logic.state = Object.assign({}, prev, patch);
        this.setState(function (s) { return { __v: s.__v + 1 }; }, cb);
      }
      componentDidMount() { try { this.logic.componentDidMount(); } catch (e) { console.error(e); } }
      componentDidUpdate(prev) { this.logic.props = this.props; try { this.logic.componentDidUpdate(prev); } catch (e) { console.error(e); } }
      componentWillUnmount() { try { this.logic.componentWillUnmount(); } catch (e) { console.error(e); } }
      render() {
        this.logic.props = this.props;
        var vals;
        try { vals = Object.assign({}, this.props, this.logic.renderVals() || {}); }
        catch (e) { console.error(e); vals = this.props; }
        return h.apply(null, [React.Fragment, null].concat(tpl(vals)));
      }
    };
  }

  window.__dcLite = { compileTemplate: compileTemplate, makeHost: makeHost, DCLogic: DCLogic };
})();
