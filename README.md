# 30X Onboarding Agent

Conversational assistant for new 30X team members. Answers questions using only internal documents — no hallucinations, no external sources.

---

## How to run

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Create a `.env.local` file at the project root:

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

Run the migration in your Supabase project (SQL editor or CLI):

```
supabase/migrations/001_documents.sql
```

This creates the `documents` table with pgvector support and the `match_documents` similarity search function.

### 4. Start the dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## How to update the knowledge base

When a document changes or a new one needs to be added:

1. Go to `http://localhost:3000/admin`
2. Enter the `ADMIN_SECRET` password
3. To add a new document: drag and drop the PDF into the upload zone
4. To update an existing document: delete it, then upload the new version — or use the **Re-index** button next to it if only the file on disk changed
5. To rebuild everything from scratch: click **Re-index all**

The admin panel re-chunks, re-embeds, and overwrites the Supabase rows automatically. No manual steps.

Source PDFs are stored in `/documents`. The agent only uses what has been indexed — uploading a file to the folder without going through the admin panel has no effect.

---

## Architecture

```
User message
    ↓
Embed query (gemini-embedding-001 / text-embedding-3-small / voyage-3)
    ↓
Supabase pgvector cosine similarity search (match_documents RPC)
    ↓
Top 10 chunks injected into system prompt as context
    ↓
LLM generates answer (gemini-2.5-flash / claude / gpt-4o-mini)
    ↓
Streamed back to client
```

Chunks: 256 tokens, 50-token overlap. Similarity threshold: 0.2.

---

## Credentials reference

| Variable | Required | Purpose |
|---|---|---|
| `LLM_PROVIDER` | No (defaults to `gemini`) | Selects the LLM + embedding provider |
| `GOOGLE_AI_API_KEY` | If `LLM_PROVIDER=gemini` | Gemini chat + embeddings |
| `ANTHROPIC_API_KEY` | If `LLM_PROVIDER=anthropic` | Claude chat |
| `VOYAGE_API_KEY` | If `LLM_PROVIDER=anthropic` | Voyage embeddings (required alongside Anthropic) |
| `OPENAI_API_KEY` | If `LLM_PROVIDER=openai` | GPT chat + embeddings |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `ADMIN_SECRET` | Yes | Password for the `/admin` panel |
