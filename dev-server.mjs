// Local dev server — mimics Vercel: serves static files and routes /api/* to
// the matching api/*.js handler. Run with `npm run dev` (needs ANTHROPIC_API_KEY
// in the environment or in .env.local). Set STUB=1 to return canned questions
// without calling the Claude API (used by the test suite).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const STUB = process.env.STUB === "1";

// Load .env.local (simple parser, no dependency) so `npm run dev` finds the key.
if (!STUB && existsSync(join(ROOT, ".env.local"))) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function shimRes(nodeRes) {
  return {
    statusCode: 200,
    setHeader: (k, v) => nodeRes.setHeader(k, v),
    status(code) { this.statusCode = code; return this; },
    json(obj) {
      nodeRes.writeHead(this.statusCode, { "content-type": "application/json; charset=utf-8" });
      nodeRes.end(JSON.stringify(obj));
    },
  };
}

async function stubGenerate(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  await new Promise((r) => setTimeout(r, 500)); // simulate latency → shows "reading" phase
  res.status(200).json({
    title: "Bloco de Teste",
    questions: [
      { n: "01", text: "Questão de teste 1 — " + (body.prompt || "sem prompt"), solution: ["Passo 1 da resolução.", "Passo 2 da resolução."], answer: "Resposta 1." },
      { n: "02", text: "Questão de teste 2 sobre tabelas-verdade.", solution: ["Único passo da resolução."], answer: "Resposta 2." },
      { n: "03", text: "Questão de teste 3 sobre equivalências.", solution: ["Passo único."], answer: "Resposta 3." },
    ],
    model: "stub",
    _echo: { discipline: body.discipline || "", context: body.context || [] },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/api/generate") {
    const shim = shimRes(res);
    try {
      if (STUB) return await stubGenerate(req, shim);
      const mod = await import("./api/generate.js");
      return await mod.default(req, shim);
    } catch (e) {
      return shim.status(500).json({ error: "dev-server: " + String(e && e.message || e) });
    }
  }

  // static
  let rel = path === "/" ? "/index.html" : path;
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const s = await stat(file);
    if (s.isDirectory()) throw new Error("dir");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404");
  }
});

server.listen(PORT, () => {
  console.log(`dev-server on http://localhost:${PORT}  ${STUB ? "(STUB /api/generate)" : "(real Claude API)"}`);
});
