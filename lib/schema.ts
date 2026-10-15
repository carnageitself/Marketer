// lib/schema.ts
// The whole schema, applied idempotently on every cold start by lib/db.ts.
// Every analytics row carries site_id, which is the tenant boundary: no query
// in lib/stats.ts runs without it.
//
// Identity model (same as the Preciprocal landing page):
//   visitor_key = 'a:' + sha256(ip | ua | salt | day | site) by default. It
//                 rotates daily and needs no cookie, so it works without a
//                 consent banner.
//               = 'v:' + uuid when the site owner turned on persistent ids
//                 (localStorage) because they collect consent.
// Visits (sessions) are assigned on the server: a new visit starts after 30
// minutes without activity from the same visitor_key.
export const SCHEMA = /* sql */ `
create table if not exists users (
  id          text primary key,
  email       text not null unique,
  name        text,
  pass_hash   text not null,
  created_at  timestamptz not null default now()
);
-- Plan (free | pro | premium) and the Stripe ids behind it; see lib/plans.ts and lib/billing.ts.
alter table users add column if not exists plan text not null default 'free';
alter table users add column if not exists billing jsonb not null default '{}'::jsonb;

-- Google / Microsoft sign-in: one row per external account linked to a user.
create table if not exists user_identities (
  provider    text not null,                   -- google | microsoft
  subject     text not null,                   -- the provider's stable user id
  user_id     text not null references users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  primary key (provider, subject)
);

-- Teams: each owner's account is a workspace; members see all of its sites.
-- A row starts as an invite (token_hash set, user_id null) and becomes a
-- membership when accepted. Roles: admin | editor | viewer (the owner is implicit).
create table if not exists team_members (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  user_id     text references users(id) on delete cascade,
  email       text not null,
  role        text not null default 'viewer',
  token_hash  text,
  invited_by  text,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index if not exists team_members_owner_email on team_members (owner_id, email);
create index if not exists team_members_user_idx on team_members (user_id);

create table if not exists auth_sessions (
  token_hash  text primary key,
  user_id     text not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists sites (
  id            text primary key,              -- public id in the script tag
  user_id       text not null references users(id) on delete cascade,
  domain        text not null,                 -- apex, lower case, no www
  verify_token  text not null,
  created_at    timestamptz not null default now(),
  installed_at  timestamptz,                   -- first event received
  verified_at   timestamptz,                   -- TXT record confirmed
  scan          jsonb not null default '{}'::jsonb,   -- last DNS / host / platform scan
  dns           jsonb not null default '{}'::jsonb,   -- first-party subdomain + auto-config state
  goals         jsonb not null default '[]'::jsonb,
  settings      jsonb not null default '{}'::jsonb
);
create index if not exists sites_user_idx on sites (user_id);

create table if not exists visits (
  id             text primary key,
  site_id        text not null references sites(id) on delete cascade,
  visitor_key    text not null,
  persistent     boolean not null default false,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  entry_path     text,
  exit_path      text,
  page_count     integer not null default 0,
  referrer       text,
  referrer_host  text,
  source_name    text,
  channel        text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_term       text,
  utm_content    text,
  device         text,
  browser        text,
  os             text,
  country        text,
  region         text,
  city           text,
  language       text,
  timezone       text,
  screen_w       integer,
  viewport_w     integer
);
create index if not exists visits_site_started_idx on visits (site_id, started_at desc);
create index if not exists visits_key_idx on visits (site_id, visitor_key, last_seen_at desc);

create table if not exists pageviews (
  id          text primary key,                -- generated in the browser
  site_id     text not null references sites(id) on delete cascade,
  visit_id    text not null references visits(id) on delete cascade,
  ts          timestamptz not null,
  path        text not null,
  title       text,
  prev_path   text,                            -- previous in-site page, drives page flow
  time_ms     integer,                         -- active time on page, updated on leave
  max_scroll  integer                          -- 0-100
);
create index if not exists pageviews_site_ts_idx on pageviews (site_id, ts desc);
create index if not exists pageviews_visit_idx on pageviews (visit_id, ts);

create table if not exists section_views (
  pageview_id   text not null references pageviews(id) on delete cascade,
  section_id    text not null,
  site_id       text not null,
  visit_id      text not null,
  ts            timestamptz not null,
  path          text not null,
  section_name  text,
  section_index integer,
  dwell_ms      integer not null default 0,    -- cumulative time >= 50% on screen
  max_visible   integer not null default 0,    -- 0-100
  primary key (pageview_id, section_id)
);
create index if not exists section_views_site_idx on section_views (site_id, path, ts desc);

create table if not exists clicks (
  id           bigserial primary key,
  site_id      text not null,
  visit_id     text not null references visits(id) on delete cascade,
  pageview_id  text,
  ts           timestamptz not null,
  path         text not null,
  kind         text,                           -- internal | app | external | anchor | mailto | tel | button
  href         text,
  target_path  text,
  label        text,
  section_id   text
);
create index if not exists clicks_site_idx on clicks (site_id, ts desc);
create index if not exists clicks_visit_idx on clicks (visit_id);

create table if not exists custom_events (
  id          bigserial primary key,
  site_id     text not null,
  visit_id    text not null references visits(id) on delete cascade,
  ts          timestamptz not null,
  path        text,
  name        text not null,
  props       jsonb not null default '{}'::jsonb
);
create index if not exists custom_events_site_idx on custom_events (site_id, ts desc);

-- Repair: postgres.js once double-encoded these columns (a JSON string holding
-- the object) because values were bound as $n::jsonb. Writes now use
-- $n::text::jsonb; this unwraps any rows written before that.
update sites set scan     = (scan #>> '{}')::jsonb     where jsonb_typeof(scan)     = 'string';
update sites set dns      = (dns #>> '{}')::jsonb      where jsonb_typeof(dns)      = 'string';
update sites set goals    = (goals #>> '{}')::jsonb    where jsonb_typeof(goals)    = 'string';
update sites set settings = (settings #>> '{}')::jsonb where jsonb_typeof(settings) = 'string';

-- Row level security with no policies: hosts like Supabase expose the public
-- schema over a REST API with a public key, and this makes every table
-- unreachable that way. The app connects as the table owner, which bypasses it.
alter table users          enable row level security;
alter table auth_sessions  enable row level security;
alter table sites          enable row level security;
alter table visits         enable row level security;
alter table pageviews      enable row level security;
alter table section_views  enable row level security;
alter table clicks         enable row level security;
alter table custom_events  enable row level security;
alter table user_identities enable row level security;
alter table team_members   enable row level security;
`;
