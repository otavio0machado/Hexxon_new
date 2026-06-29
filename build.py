#!/usr/bin/env python3
"""Assemble the self-contained frontend `index.html` from the editable app/ files.

  app/template.html  — the view (DSL: {{ }}, <sc-if>, <sc-for>, style-hover, ref)
  app/runtime.js     — dc-lite, the small open renderer for that DSL on React 18
  app/logic.js       — the application logic (`class Component extends DCLogic`)
  app/boot.js        — compiles the template and mounts the component

These started as a faithful import of the Claude Design project
"Sandbox de Nós.dc.html" (kept verbatim under design/) and were then modified for
real use: starts empty, generates questions via the Claude API (api/generate.js),
and persists to localStorage. React + fonts load from CDN.

Run:  python3 build.py   (or: npm run build)
"""
import pathlib

ROOT = pathlib.Path(__file__).parent
APP = ROOT / "app"
OUT = ROOT / "public" / "index.html"  # Vercel serves this dir statically

template = (APP / "template.html").read_text().strip("\n")
runtime = (APP / "runtime.js").read_text().strip()
logic = (APP / "logic.js").read_text().strip()
boot = (APP / "boot.js").read_text().strip()

assert logic.startswith("class Component extends DCLogic"), logic[:60]
assert "dc-lite" in runtime[:200], "runtime.js doesn't look like dc-lite"

# The logic references DCLogic, exposed by dc-lite on window.__dcLite.
logic_wrapped = "/* ===== Application logic ===== */\nvar DCLogic = window.__dcLite.DCLogic;\n" + logic

HEAD = r"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sandbox de Nós — Margem</title>
<meta name="description" content="Sandbox de Nós — quadro de estudos com nós e questões geradas por IA.">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#FAF8F3">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%237A1F2B'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
  html,body{height:100%;margin:0;background:#FAF8F3;}
  #app{height:100%;}
  *{box-sizing:border-box;}
  ::selection{background:rgba(122,31,43,0.16);}
  @keyframes ox-blink{0%,46%{opacity:1}47%,100%{opacity:0}}
  @keyframes ox-sweep{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
  @keyframes ox-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ox-scale{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}
  textarea::placeholder,input::placeholder{color:rgba(33,30,26,0.34);}
  .ox-scroll::-webkit-scrollbar{width:9px;height:9px;}
  .ox-scroll::-webkit-scrollbar-thumb{background:rgba(33,30,26,0.18);border-radius:0;}
  .ox-scroll::-webkit-scrollbar-track{background:transparent;}
</style>
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
</head>
<body>
<div id="app"></div>

<script type="text/html" id="dc-template">
"""

doc = (
    HEAD
    + template
    + "\n</script>\n\n<script>\n"
    + runtime
    + "\n\n"
    + logic_wrapped
    + "\n\n"
    + boot
    + "\n</script>\n</body>\n</html>\n"
)

# The embedded blocks must not terminate the <script> early.
assert "</script" not in template.lower(), "template contains </script>!"
assert "</script" not in logic.lower(), "logic contains </script>!"

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(doc)
print("wrote", OUT, "—", len(doc), "bytes")
print("template:", len(template), "| runtime:", len(runtime), "| logic:", len(logic), "| boot:", len(boot))
print("ok")
