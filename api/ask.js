// Vercel serverless function — Claude proxy for grounded Q&A over a document
// (e.g. "ask the PDF"). Returns a free-text answer grounded in the provided context.
// Key stays on the server (ANTHROPIC_API_KEY), like api/generate.js.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.MODEL || "claude-opus-4-8";

const SYSTEM = [
  "Você responde perguntas de estudo com base APENAS no documento fornecido pelo aluno.",
  "Responda em português do Brasil, de forma objetiva e didática.",
  "Use LaTeX para matemática: $...$ na linha e $$...$$ destacado.",
  "Se a resposta não estiver no documento, diga isso claramente em vez de inventar.",
  "Quando útil, cite a parte do documento que embasa a resposta.",
].join(" ");

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método não permitido. Use POST." }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Servidor sem ANTHROPIC_API_KEY configurada.", hint: "Defina ANTHROPIC_API_KEY (veja .env.example / README)." });

  const body = await readJson(req);
  const question = (body.question || "").toString().slice(0, 2000);
  const filename = (body.filename || "documento").toString().slice(0, 200);
  const context = (body.context || "").toString().slice(0, 60000);
  // optional page images (data URLs) for scanned/figure-heavy PDFs — Claude reads them
  const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
  if (!question.trim()) return res.status(400).json({ error: "Forneça uma pergunta." });
  if (!context.trim() && !images.length) return res.status(400).json({ error: "Documento sem texto nem imagens para consultar." });

  const content = [];
  images.forEach((u) => {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(String(u));
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  });
  content.push({ type: "text", text: (context.trim() ? `Documento [${filename}]:\n${context}\n\n` : `Documento [${filename}] (páginas em imagem acima).\n\n`) + `Pergunta do aluno: ${question.trim()}` });

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return res.status(502).json({ error: "Falha ao contatar a API da Claude.", detail: String((e && e.message) || e) });
  }

  if (!upstream.ok) {
    let detail = "";
    try { detail = (await upstream.json())?.error?.message || ""; } catch { /* ignore */ }
    return res.status(upstream.status).json({ error: `A API da Claude retornou ${upstream.status}.`, detail });
  }

  const data = await upstream.json();
  if (data.stop_reason === "refusal") return res.status(422).json({ error: "O modelo recusou o pedido." });
  const block = Array.isArray(data.content) && data.content.find((b) => b.type === "text");
  const answer = block ? block.text : "";
  if (!answer) return res.status(502).json({ error: "Resposta vazia da API." });
  return res.status(200).json({ answer, model: data.model || MODEL });
}
