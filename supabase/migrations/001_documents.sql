-- Enable pgvector extension
create extension if not exists vector;

-- Documents table
create table if not exists documents (
  id          uuid        primary key default gen_random_uuid(),
  filename    text        not null,
  chunk_index int         not null,
  content     text        not null,
  embedding   vector(768),
  created_at  timestamptz not null default now()
);

-- IVFFlat index for cosine similarity search
create index if not exists documents_embedding_idx
  on documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Similarity search function
create or replace function match_documents(
  query_embedding vector(768),
  match_count     int default 5
)
returns table (
  id          uuid,
  filename    text,
  chunk_index int,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    id,
    filename,
    chunk_index,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
