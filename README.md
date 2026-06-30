# Sandbox de Nós — Margem

Um quadro de estudos baseado em **nós**. Você cria disciplinas, abre um quadro
infinito (com *pan*/zoom), solta nós, conecta-os e **invoca a IA** para gerar um
bloco de questões de prova — com resolução passo a passo e resposta — que você
pode abrir, resolver e conferir.

Importado do projeto Claude Design **"Sandbox de nós com IA"** e preparado para
**uso real**: começa vazio, gera questões com a **API da Claude** e salva tudo
no navegador.

---

## ⚙️ O que você precisa configurar manualmente

Só há **uma** coisa obrigatória para o app funcionar de verdade: a chave da API.

1. **Criar uma chave da API da Anthropic**
   - Acesse <https://console.claude.com/settings/keys> e gere uma chave (`sk-ant-…`).
   - É um serviço **pago** por uso. Cada "Invocar IA" faz 1 chamada ao modelo.

2. **Rodar localmente** (testar na sua máquina)
   - `cp .env.example .env.local` e cole a chave em `ANTHROPIC_API_KEY`.
   - `npm run dev` → abra <http://localhost:8000>.
   - (Não precisa instalar dependências — usa só o Node ≥ 18.)

3. **Publicar na web (Vercel)** — quando quiser
   - Suba a pasta para um repositório no GitHub.
   - Em <https://vercel.com> → **Add New → Project** → importe o repositório
     (o `vercel.json` e a pasta `api/` já estão prontos; *framework: Other*).
   - Em **Settings → Environment Variables**, adicione `ANTHROPIC_API_KEY` com a
     sua chave. **Deploy.** Pronto — a chave fica no servidor, nunca no navegador.
   - (Alternativa por terminal: `npm i -g vercel` → `vercel` → `vercel env add ANTHROPIC_API_KEY`.)

Opcionais:
- **Seu nome/curso:** edite `IDENT` no topo de `app/logic.js` e rode `npm run build`.
- **Modelo mais barato:** defina a variável `MODEL` (ex.: `claude-haiku-4-5`).

> ⚠️ Servir só os arquivos estáticos (ex.: `python -m http.server`) **não**
> funciona para a geração — o `/api/generate` precisa do Node (`npm run dev`) ou
> da Vercel. Sem isso, "Invocar IA" mostra um erro de rede.

---

## Como funciona o fluxo

1. **Nova disciplina** na estante → abre um quadro vazio.
2. **Material:** crie uma **Nota** (`+ Nota`) e cole seu conteúdo, ou importe um **PDF**
   (`↥ PDF`, texto extraído no navegador). Arraste a alça ● para **conectar** o material a um nó.
3. **Toque duplo** no papel cria um nó de geração. Selecione → **Invocar IA** →
   escreva o pedido (ex.: *"5 questões de derivadas, nível intermediário"*) → ↵.
4. O navegador chama `/api/generate`, que chama a Claude com **saída estruturada**
   (JSON garantido), enviando o material conectado como contexto. O nó "digita" o resultado.
5. **Abrir leitura** → resolva, marque como resolvida, veja a resolução. O progresso é salvo.
6. **Revisar** (flashcards) → vire o cartão, marque *Eu sei* / *Revisar de novo*.
   **↓ PDF** exporta o bloco para impressão/PDF.
7. Tudo é salvo automaticamente (localStorage). Renomear/excluir disciplina e
   excluir questões estão na própria tela; **Apagar tudo** está em *Conta*.

> Os dados ficam **só neste navegador** (sem nuvem/login ainda — planejado para um
> projeto Supabase dedicado, separado do seu sistema do laboratório).

---

## Arquitetura

| Caminho | O que é |
|---|---|
| **`public/index.html`** | App pronto (gerado pelo build). Frontend estático: React 18 (CDN) + *dc-lite*. |
| **`api/generate.js`** | Função serverless (Vercel/Node) que chama a Claude. **Guarda a chave.** |
| `app/template.html` | A view (DSL: `{{ }}`, `<sc-if>`, `<sc-for>`, `style-hover`, `ref`). |
| `app/logic.js` | A lógica (`class Component extends DCLogic`) — estado, IA, persistência. |
| `app/runtime.js` | *dc-lite* — renderizador aberto da DSL sobre React (sem dependência proprietária). |
| `app/boot.js` | Compila o template e monta o componente. |
| `build.py` | Monta o `index.html` a partir de `app/`. |
| `dev-server.mjs` | Servidor local (estático + `/api/*`), igual à Vercel. `STUB=1` usa IA falsa. |
| `design/` | Importação original do Claude Design (referência). |
| `test/run.mjs` | Suíte headless (Chrome) — 35 verificações do fluxo real. |

O `index.html` mantém **template e lógica como arquivos editáveis** e os renderiza
com um runtime aberto de ~250 linhas (*dc-lite*) — **sem depender do `support.js`
gerado** pela ferramenta de design. É um app real e seu.

---

## Reconstruir / testar

```bash
python3 build.py          # regenera public/index.html a partir de app/  (ou: npm run build)
cd test && npm install puppeteer-core && node run.mjs   # 35 verificações
```

Se você puxar uma versão nova de `design/Sandbox de Nós.dc.html` do Claude Design,
ela fica como referência; as edições de uso real vivem em `app/`.
