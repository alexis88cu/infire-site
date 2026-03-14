-- Atlas Web Agency — Supabase Schema
-- Run this in your Supabase SQL editor

-- ─────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────
create table leads (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_name    text,
  phone         text,
  email         text,
  address       text,
  city          text,
  niche         text,                    -- roofing, hvac, dentist, etc.
  website_url   text,
  google_rating numeric(2,1),
  google_reviews int,
  google_place_id text unique,
  website_score int,                     -- 1-10 (10 = no website)
  lead_score    int,                     -- 1-10 (Claude's overall score)
  status        text default 'new',      -- new | demo_sent | interested | proposal_sent | contract_pending | client | lost
  demo_url      text,
  notes         text,
  source        text default 'google_places',
  created_at    timestamptz default now(),
  last_contacted_at timestamptz,
  follow_up_at  timestamptz
);

-- ─────────────────────────────────────────
-- MESSAGES (email + WhatsApp history)
-- ─────────────────────────────────────────
create table messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  channel     text not null,            -- email | whatsapp
  direction   text not null,            -- outbound | inbound
  subject     text,
  body        text not null,
  wa_msg_id   text,                     -- WhatsApp message ID
  sent_at     timestamptz default now(),
  read_at     timestamptz
);

-- ─────────────────────────────────────────
-- CONTRACTS
-- ─────────────────────────────────────────
create table contracts (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  plan        text not null,            -- starter | professional | premium
  setup_fee   int not null,
  monthly_fee numeric(8,2) not null,
  status      text default 'draft',     -- draft | pending_approval | approved | sent | signed | cancelled
  content     text,                     -- full contract text (markdown)
  signed_at   timestamptz,
  created_at  timestamptz default now(),
  approved_at timestamptz,
  sent_at     timestamptz
);

-- ─────────────────────────────────────────
-- CLIENTS (after contract signed + paid)
-- ─────────────────────────────────────────
create table clients (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid references leads(id),
  contract_id          uuid references contracts(id),
  business_name        text not null,
  website_url          text,
  plan                 text,
  paypal_subscription_id text,
  setup_paid           boolean default false,
  monthly_amount       numeric(8,2),
  start_date           date default current_date,
  status               text default 'active',  -- active | paused | churned
  created_at           timestamptz default now()
);

-- ─────────────────────────────────────────
-- DEMOS (generated demo pages)
-- ─────────────────────────────────────────
create table demos (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  slug        text unique not null,
  niche       text,
  content     jsonb,                    -- { businessName, tagline, services, colors, ... }
  view_count  int default 0,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────
-- AGENT LOGS (activity feed)
-- ─────────────────────────────────────────
create table agent_logs (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null,               -- scout | analyzer | outreach | contract | orchestrator
  action      text not null,               -- what happened (short label)
  details     text,                        -- longer description
  lead_id     uuid references leads(id) on delete set null,
  level       text default 'info',         -- info | success | warning | error
  created_at  timestamptz default now()
);

create index agent_logs_created_idx on agent_logs(created_at desc);
create index agent_logs_agent_idx on agent_logs(agent);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index leads_status_idx on leads(status);
create index leads_follow_up_idx on leads(follow_up_at) where follow_up_at is not null;
create index messages_lead_idx on messages(lead_id);
create index contracts_status_idx on contracts(status);
create index clients_status_idx on clients(status);

-- ─────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────

-- KPI summary view
create or replace view agency_kpis as
select
  (select count(*) from leads where created_at > now() - interval '7 days') as leads_this_week,
  (select count(*) from leads where status = 'demo_sent' and last_contacted_at > now() - interval '7 days') as demos_sent_this_week,
  (select count(*) from messages where direction = 'inbound' and sent_at > now() - interval '7 days') as replies_this_week,
  (select count(*) from clients where status = 'active') as total_clients,
  (select coalesce(sum(monthly_amount), 0) from clients where status = 'active') as current_mrr,
  (select count(*) from contracts where status = 'pending_approval') as contracts_pending,
  (select count(*) from leads where status in ('interested', 'proposal_sent')) as hot_leads;
