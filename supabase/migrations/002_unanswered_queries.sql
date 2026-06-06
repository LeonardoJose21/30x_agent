create table if not exists unanswered_queries (
  id               uuid        primary key default gen_random_uuid(),
  query            text        not null,
  escalation_target text       not null,
  created_at       timestamptz not null default now()
);
