-- Dedup is a database concern. WebSub re-fires on title and description
-- edits, so the same video arrives repeatedly and must collapse here.

create table if not exists uwufeed_items (
  id            bigint generated always as identity primary key,
  source_id     bigint not null references uwufeed_sources(id) on delete cascade,
  external_id   text not null,
  title         text,
  url           text,
  author        text,
  summary       text,
  thumbnail_url text,
  published_at  timestamptz,
  kind          text not null default 'post'
                check (kind in ('video', 'article', 'post', 'stream')),
  fetched_at    timestamptz not null default now(),

  unique (source_id, external_id)
);

create index if not exists uwufeed_items_published_idx
  on uwufeed_items (published_at desc);

create index if not exists uwufeed_items_source_published_idx
  on uwufeed_items (source_id, published_at desc);

-- Drift detection: a source returning 200 with stale content.
create index if not exists uwufeed_items_fetched_idx
  on uwufeed_items (fetched_at desc);
