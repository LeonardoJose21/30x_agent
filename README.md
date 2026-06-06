# 30X Onboarding Agent

## What it is and why it exists

Every month, new people join 30X — volunteers, part-time contractors, full-time hires. Today, someone on the team (usually the Chief of Staff or an area lead) spends 1–2 hours per person answering the same basic questions: what does each area do, what tools do we use, who do I contact for X, where does the documentation live.

That time is expensive, the answers are inconsistent, and nothing gets recorded. The next new person asks the same questions.

This agent is the first point of contact for anyone joining 30X. It answers questions about the organization using only the internal documents provided — no hallucinations, no external sources. If it doesn't know, it says so and tells you who to ask.

---

## Local setup

### 1. Clone and install

```bash
git clone <repo-url>
cd 30x-onboarding-agent
npm install
```

### 2. Set environment variables

Create `.env.local` at the project root:

```env
# LLM provider — options: gemini (default, free tier), anthropic, openai
LLM_PROVIDER=gemini

# API keys — only the one matching LLM_PROVIDER is required
GOOGLE_AI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

# Required when LLM_PROVIDER=anthropic (used for embeddings via Voyage)
VOYAGE_API_KEY=your_key_here

# Supabase
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key

# Admin panel password
ADMIN_SECRET=choose_a_password
```

### 3. Set up the database

Run both migrations in your Supabase project (SQL Editor):

```
supabase/migrations/001_documents.sql
supabase/migrations/002_unanswered_queries.sql
```

### 4. Start

```bash
npm run dev
```

App runs at `http://localhost:3000`. Admin panel at `http://localhost:3000/admin`.

---

## How to add or update a document

1. Go to `/admin` and enter your `ADMIN_SECRET`
2. Drag and drop a PDF into the upload zone — it gets chunked, embedded, and indexed automatically
3. To update an existing doc: delete it and re-upload, or hit **Re-index** if the file on disk already changed
4. To rebuild everything: **Re-index all**

The agent only uses what has been indexed. Dropping a file into `/documents` without going through the admin panel has no effect.

---

## How to switch LLM providers

Change `LLM_PROVIDER` in `.env.local` and restart the server:

| Value | LLM | Embeddings | Cost |
|---|---|---|---|
| `gemini` | Gemini 2.5 Flash | gemini-embedding-001 | Free tier |
| `anthropic` | Claude Haiku | Voyage-3 (requires `VOYAGE_API_KEY`) | Paid |
| `openai` | GPT-4o mini | text-embedding-3-small | Paid |

**Important:** if you switch providers, re-index all documents. Embeddings from different models are not compatible — mixing them breaks similarity search.

---

## Architecture

```
User message
      │
      ▼
Intent check ──── conversational? ────► skip retrieval
      │ no
      ▼
Embed query
(gemini-embedding-001 / voyage-3 / text-embedding-3-small)
      │
      ▼
Supabase pgvector
match_documents RPC — cosine similarity
      │
      ▼
Top chunks (sim ≥ 0.2)
If all scores < 0.5 → fallback: fetch topK=14
      │
      ▼
Inject context into system prompt
      │
      ▼
LLM generates answer
(gemini-2.5-flash / claude-haiku / gpt-4o-mini)
      │
      ▼
TransformStream — stream to client
+ detect "no encontré" → log to unanswered_queries
      │
      ▼
Client renders markdown (bold, bullets, nested lists)
```

Chunks: 256 tokens, 50-token overlap. Threshold: 0.2. TopK: 10 (fallback: 14).

---

## Gap analysis — what the current documents don't cover

The agent can only answer what's in the documents. The following gaps were identified during development. Each one is a question a new team member would reasonably ask that the agent currently cannot answer:

| Gap | Impact |
|---|---|
| **Chief of Staff has no name** | The agent routes unanswered questions to "Chief of Staff" but can't say who that is or how to reach them |
| **No timezone information** | For a distributed team across LATAM + US + Europe, a new member has no way to know when their teammates are online |
| **No Day 1 tool access process** | No document explains how to request access to Notion, Slack, or any other tool on the first day |
| **No escalation SLA** | The agent says "ask the Chief of Staff" but there's no guidance on expected response times |
| **Volunteer compensation is vague** | Documents mention "learning and growth" but don't define what volunteers actually receive or what the commitment looks like |
| **No AI workflow documentation** | 30X requires AI use across all roles but no document explains which tools are standard, how to use them, or what's expected |
| **No feedback loop for agent failures** | ~~No way to know what questions the agent couldn't answer~~ **Solved** — unanswered queries are logged automatically and visible in `/admin`, grouped by frequency |

The unanswered queries panel in `/admin` surfaces new gaps over time as real users interact with the agent.
