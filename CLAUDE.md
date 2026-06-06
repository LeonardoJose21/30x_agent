## Project
30X Onboarding Agent — a conversational assistant that answers questions 
for new 30X team members using only internal documentation.

## Architecture
- Next.js 14 App Router + TypeScript + Tailwind
- RAG pipeline: PDFs → chunked → embedded → stored in Supabase pgvector
- Strategy Pattern for LLM providers (Claude / OpenAI / Gemini), 
  selected via LLM_PROVIDER env var, default: gemini (free tier)
- Streaming responses via ReadableStream

## Folder structure
lib/supabase.ts               → typed Supabase client + Database/Document/MatchResult types
supabase/migrations/001_documents.sql → pgvector extension, documents table, ivfflat index, match_documents fn
lib/providers/base.ts         → LLMProvider interface
lib/providers/anthropic.ts    → Claude implementation
lib/providers/openai.ts       → OpenAI implementation
lib/providers/gemini.ts       → Gemini implementation
lib/providers/index.ts        → factory: getProvider()
lib/indexer.ts                → indexPDF(): pdf-parse → tiktoken chunks (500t/50 overlap) → embed → Supabase upsert
lib/retriever.ts              → getRelevantContext(): embed query → match_documents RPC → formatted string
app/api/chat/route.ts         → RAG + streaming chat
app/api/admin/upload/route.ts → GET list | POST upload+index | DELETE chunks+file | PATCH reindex
app/admin/page.tsx            → admin UI: auth gate, doc list, upload zone
app/page.tsx                  → chat UI
documents/                    → source PDFs live here

## Key rules (never break these)
- Nothing outside lib/providers/* imports a specific SDK directly
- app/api/chat never hardcodes a model name or provider
- Chunking: 500 tokens, 50-token overlap
- Always stream responses, never wait for full completion
- Every new file gets a corresponding entry in this CLAUDE.md

## Env vars needed
LLM_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY,
GOOGLE_AI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_SECRET,
VOYAGE_API_KEY (required when LLM_PROVIDER=anthropic, for voyage-3 embeddings)