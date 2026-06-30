// Vercel serverless function — Claude proxy that turns a course syllabus
// ("cronograma"/"ementa") into a structured list of topics, so the app can lay
// out a pre-canvas of lesson nodes when a discipline is created.
//
// Same key-stays-on-the-server design as api/generate.js; structured output via
// output_config.format (json_schema).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.MODEL || "claude-opus-4-8";

const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Nome curto da disciplina, se identificável; senão string vazia." },
    lessons: {
      type: "array",
      description: "Tópicos/aulas/unidades em ordem, títulos curtos (3 a 8 palavras).",
      items: { type: "string" },
    },
  },
  required: ["title", "lessons"],
};

const SYSTEM = [
  "Você lê o cronograma/ementa de uma disciplina universitária brasileira e extrai a lista ordenada de tópicos (aulas/unidades).",
  "Devolva títulos curtos e claros, em português do Brasil, sem numeração no texto (a numeração é feita pelo app).",
  "Una itens redundantes; foque no conteúdo de estudo. Gere no máximo 16 tópicos.",
  "Se não houver tópicos claros, devolva uma lista vazia.",
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Servidor sem ANTHROPIC_API_KEY configurada.", hint: "Defina ANTHROPIC_API_KEY (veja .env.example / README)." });
  }

  const body = await readJson(req);
  const discipline = (body.discipline || "").toString().slice(0, 200);
  const syllabus = (body.syllabus || "").toString().slice(0, 16000);
  if (!syllabus.trim()) return res.status(400).json({ error: "Forneça o texto do cronograma/ementa." });

  const userText = [
    discipline ? `Disciplina: ${discipline}` : null,
    `Cronograma / ementa:\n${syllabus.trim()}`,
  ].filter(Boolean).join("\n\n");

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
        output_config: { format: { type: "json_schema", schema: OUTLINE_SCHEMA } },
      }),
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

  const textBlock = Array.isArray(data.content) && data.content.find((b) => b.type === "text");
  if (!textBlock) return res.status(502).json({ error: "Resposta inesperada da API (sem conteúdo de texto)." });

  let parsed;
  try { parsed = JSON.parse(textBlock.text); } catch { return res.status(502).json({ error: "A API não retornou JSON válido." }); }

  const lessons = (Array.isArray(parsed.lessons) ? parsed.lessons : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 16);
  return res.status(200).json({ title: (parsed.title || "").toString(), lessons, model: data.model || MODEL });
}
