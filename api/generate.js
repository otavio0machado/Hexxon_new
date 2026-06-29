// Vercel serverless function — Claude proxy for "Sandbox de Nós".
//
// The browser never sees the API key: it POSTs {discipline, context[], prompt}
// here, and this function calls the Claude Messages API with the key from the
// ANTHROPIC_API_KEY environment variable and returns structured questions.
//
// Structured output is enforced with output_config.format (json_schema), so the
// model's first content block is guaranteed-valid JSON matching QUESTION_SCHEMA.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.MODEL || "claude-opus-4-8";

// JSON Schema for the generated block. Note: structured outputs disallow
// numeric/length constraints (minItems, etc.) — count is steered by the prompt.
const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Título curto do bloco (2 a 5 palavras)." },
    questions: {
      type: "array",
      description: "As questões de estudo geradas.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          n: { type: "string", description: "Número da questão com dois dígitos, ex.: 01, 02." },
          text: { type: "string", description: "Enunciado completo da questão." },
          solution: {
            type: "array",
            items: { type: "string" },
            description: "Passos da resolução, um por item (1 a 4 passos curtos).",
          },
          answer: { type: "string", description: "Resposta final, concisa." },
        },
        required: ["n", "text", "solution", "answer"],
      },
    },
  },
  required: ["title", "questions"],
};

const SYSTEM = [
  "Você gera blocos de questões de estudo para estudantes universitários brasileiros.",
  "A partir da disciplina, do contexto conectado e do pedido do aluno, crie questões de prova claras, com resolução passo a passo e resposta final.",
  "Escreva em português do Brasil. Use notação matemática em texto simples (->, <->, ^, /, ¬, ∧, ∨, raiz, etc.).",
  "Gere de 3 a 5 questões, a menos que o pedido especifique outra quantidade.",
  "Cada resolução deve ter de 1 a 4 passos curtos. A resposta final deve ser objetiva.",
  "Numere as questões como 01, 02, 03…",
].join(" ");

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // Fallback: read the raw stream (when the platform didn't pre-parse).
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
    return res.status(500).json({
      error: "Servidor sem ANTHROPIC_API_KEY configurada.",
      hint: "Defina a variável de ambiente ANTHROPIC_API_KEY (veja .env.example / README).",
    });
  }

  const body = await readJson(req);
  const discipline = (body.discipline || "").toString().slice(0, 200);
  const prompt = (body.prompt || "").toString().slice(0, 4000);
  const context = Array.isArray(body.context)
    ? body.context.map((c) => String(c).slice(0, 2000)).filter(Boolean).slice(0, 30)
    : [];

  if (!prompt.trim() && !context.length) {
    return res.status(400).json({
      error: "Forneça um pedido (prompt) ou conecte nós para dar contexto.",
    });
  }

  const userText = [
    discipline ? `Disciplina: ${discipline}` : null,
    context.length ? `Contexto conectado:\n${context.map((c) => `- ${c}`).join("\n")}` : null,
    `Pedido do aluno: ${prompt.trim() || "Gere questões de estudo a partir do contexto acima."}`,
  ].filter(Boolean).join("\n\n");

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
        output_config: { format: { type: "json_schema", schema: QUESTION_SCHEMA } },
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: "Falha ao contatar a API da Claude.", detail: String(e && e.message || e) });
  }

  if (!upstream.ok) {
    let detail = "";
    try { detail = (await upstream.json())?.error?.message || ""; } catch { /* ignore */ }
    return res.status(upstream.status).json({
      error: `A API da Claude retornou ${upstream.status}.`,
      detail,
    });
  }

  const data = await upstream.json();

  if (data.stop_reason === "refusal") {
    return res.status(422).json({ error: "O modelo recusou o pedido. Reformule o prompt." });
  }

  const textBlock = Array.isArray(data.content) && data.content.find((b) => b.type === "text");
  if (!textBlock) {
    return res.status(502).json({ error: "Resposta inesperada da API (sem conteúdo de texto)." });
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return res.status(502).json({ error: "A API não retornou JSON válido." });
  }

  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (!questions.length) {
    return res.status(502).json({ error: "Nenhuma questão foi gerada. Tente novamente." });
  }

  // Normalize + cap so the client always gets a predictable shape.
  const clean = questions.slice(0, 8).map((q, i) => ({
    n: (q.n || String(i + 1).padStart(2, "0")).toString(),
    text: (q.text || "").toString(),
    solution: Array.isArray(q.solution) ? q.solution.map(String) : [],
    answer: (q.answer || "").toString(),
  }));

  return res.status(200).json({
    title: (parsed.title || "Bloco de Questões").toString(),
    questions: clean,
    model: data.model || MODEL,
    usage: data.usage || null,
  });
}
