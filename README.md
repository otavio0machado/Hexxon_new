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
- **Seu nome/curso:** edite em **Conta → Perfil** (nome, iniciais, curso, semestre); persiste e sincroniza.
- **Modelo mais barato:** defina a variável `MODEL` (ex.: `claude-haiku-4-5`).
- **Conta na nuvem (sincronizar entre dispositivos):** configure um projeto Supabase
  dedicado — veja a seção *Nuvem* abaixo. Sem isso, o app funciona normalmente, só
  salvando localmente.

> ⚠️ Servir só os arquivos estáticos (ex.: `python -m http.server`) **não**
> funciona para a geração — o `/api/generate` precisa do Node (`npm run dev`) ou
> da Vercel. Sem isso, "Invocar IA" mostra um erro de rede.

---

## Como funciona o fluxo

1. **Nova disciplina** na estante → abre um quadro vazio.
2. **Material:** crie uma **Nota** (`+ Nota`) e cole seu conteúdo, ou importe um **PDF**
   (`↥ PDF`) — dá pra **abrir e ler o PDF** dentro do site (visualizador nativo) e o texto
   é extraído para a IA. Arraste a alça ● para **conectar** o material a um nó.
3. **Toque duplo** no papel cria um nó de geração. Selecione → **Invocar IA** →
   escolha **quantidade** e **nível** e escreva o pedido (ex.: *"foco em derivadas"*) → ↵.
4. A IA escreve a matemática em **LaTeX** (`$...$` / `$$...$$`), renderizada com **KaTeX** nas questões, resoluções, flashcards e notas. O navegador chama `/api/generate` com **saída estruturada**
   (JSON garantido), enviando o material conectado como contexto. O nó "digita" o resultado.
5. **Abrir leitura** → escreva sua resolução (é salva), marque como resolvida, veja a resolução e a margem. Tudo persiste.
6. **Revisar** (flashcards) → vire o cartão, marque *Eu sei* / *Revisar de novo*.
   **↓ PDF** exporta o bloco para impressão/PDF. No quadro, **↻ revisar tudo** junta as
   questões de **todos** os blocos num baralho ordenado pelas mais fracas (Leitner). No cartão: **espaço** vira, **←/→** navegam, **1/2** avaliam, **↬ embaralhar**.
7. Tudo é salvo automaticamente (localStorage; e na nuvem se você entrar — veja abaixo).

### Editar o quadro
- **Mover/conectar:** arraste o nó; arraste a alça ● para criar uma conexão.
- **Apagar conexão:** clique no ponto no meio da linha → aparece o ✕ → confirme.
- **Duplicar / excluir nó:** selecione o nó → barra **⧉ duplicar · ✕ excluir**
  (ou `⌘/Ctrl+D` para duplicar, `Delete` para excluir).
- **Redimensionar:** arraste a alça no canto inferior-direito do nó (notas, imagens, PDFs,
  aulas e blocos de IA). O tamanho escolhido é **preservado ao regenerar** o bloco; blocos
  grandes ganham rolagem interna.
- **Imagens:** **+ Imagem** (ou **cole com ⌘V**) cria um nó de imagem. A imagem fica salva no
  navegador (IndexedDB) e o nó guarda só uma miniatura leve; **⤢** abre em tela cheia. Dá pra pôr legenda e redimensionar.
- **PDFs:** **↥ PDF** cria um nó de PDF com **miniatura da 1ª página** e nº de páginas → **abrir PDF** abre o visualizador (o arquivo fica
  salvo localmente no navegador via IndexedDB; o texto extraído vai para a IA). Em outro
  dispositivo o texto sincroniza, mas o arquivo em si fica no aparelho de origem.
- **Notas estilo Notion:** **⤢ editar** abre o editor em tela cheia com formatação
  (`#/##/###`, listas `-` e `1.`, citação `>`, linha `---`, `**negrito**` `*itálico*` `` `código` `` `[link](url)`), atalhos **⌘B/⌘I**, e alternância **Editar / Pré-visualizar**.
- **Desfazer / refazer:** `⌘/Ctrl+Z` e `⌘/Ctrl+⇧Z` (também os botões ↶ ↷ no quadro).
- **Zoom por teclado:** `+`/`-` aproximam/afastam, `0` enquadra tudo, `F` enquadra o nó selecionado.
- **Gerenciar disciplinas pela estante:** botão **⋯** na lombada → *Abrir*, *Renomear*, **cor**, **reordenar ←/→**, *Excluir*.
- **Buscar** (`⌘/Ctrl+K`): acha disciplinas, aulas, nós, **notas, imagens (legenda) e PDFs (nome/texto)**; navegue com ↑/↓ e abra com ↵.

### Criar disciplina a partir do cronograma
No modal **Nova disciplina** você pode colar o cronograma/ementa (ou puxar de um **PDF**)
e deixar **Gerar matérias com IA** ligado: a IA (`/api/outline`) extrai os tópicos e o app
monta um **pré-canvas** já com o nó-título da disciplina + um nó por matéria, conectados.
Cada nó de aula abre um **editor de material**: cole/escreva o conteúdo real da aula — ele persiste e, conectado a um nó de geração, vira contexto da IA.

### Nuvem (opcional — Supabase)
Para salvar e sincronizar entre dispositivos com login por e-mail (sem senha):

1. Crie um projeto em <https://supabase.com> (dedicado a este app, **não** o banco do laboratório).
2. No **SQL Editor**, rode o arquivo `supabase/migrations/0001_sdn_state.sql` (cria a tabela
   `sdn_state` com Row Level Security — cada usuário só lê/escreve a própria linha).
3. Em **Authentication → Providers → Email**, deixe o login por e-mail ativo (OTP/código).
4. Defina as variáveis no servidor (`.env.local` para `npm run dev`, ou na Vercel):
   `SUPABASE_URL` e `SUPABASE_ANON_KEY` (a chave *anon/publishable* é pública por design).
5. Pronto: em **Conta → Conta na nuvem**, entre com seu e-mail. Os dados locais migram
   para a nuvem no primeiro login e passam a sincronizar automaticamente.

Sem essas variáveis, a sincronização fica desativada e o app segue só com localStorage.

**Backup:** em **Conta** há **↓ Exportar** / **↥ Importar** (arquivo `.json` com tudo). Se o
armazenamento local encher, o app avisa para exportar e liberar espaço.

---

## Arquitetura

| Caminho | O que é |
|---|---|
| **`public/index.html`** | App pronto (gerado pelo build). Frontend estático: React 18 (CDN) + *dc-lite*. |
| **`api/generate.js`** | Função serverless (Vercel/Node) que chama a Claude. **Guarda a chave.** |
| `api/outline.js` | Serverless: transforma o cronograma/ementa em lista de matérias (pré-canvas). |
| `api/config.js` | Devolve ao navegador a config **pública** do Supabase (URL + anon key), se houver. |
| `supabase/migrations/` | SQL da tabela `sdn_state` (estado na nuvem, com RLS por usuário). |
| `app/template.html` | A view (DSL: `{{ }}`, `<sc-if>`, `<sc-for>`, `style-hover`, `ref`). |
| `app/logic.js` | A lógica (`class Component extends DCLogic`) — estado, IA, persistência. |
| `app/runtime.js` | *dc-lite* — renderizador aberto da DSL sobre React (sem dependência proprietária). |
| `app/boot.js` | Compila o template e monta o componente. |
| `build.py` | Monta o `index.html` a partir de `app/`. |
| `dev-server.mjs` | Servidor local (estático + `/api/*`), igual à Vercel. `STUB=1` usa IA falsa. |
| `design/` | Importação original do Claude Design (referência). |
| `test/run.mjs` | Suíte headless (Chrome) — 119 verificações do fluxo real. |

O `index.html` mantém **template e lógica como arquivos editáveis** e os renderiza
com um runtime aberto de ~250 linhas (*dc-lite*) — **sem depender do `support.js`
gerado** pela ferramenta de design. É um app real e seu.

---

## Reconstruir / testar

```bash
python3 build.py          # regenera public/index.html a partir de app/  (ou: npm run build)
npm install puppeteer-core && node test/run.mjs         # 119 verificações
```

Se você puxar uma versão nova de `design/Sandbox de Nós.dc.html` do Claude Design,
ela fica como referência; as edições de uso real vivem em `app/`.
