-- Migration: Add agent_logs table for activity feed
-- Run this in your Supabase SQL editor

create table if not exists agent_logs (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null,               -- scout | analyzer | outreach | contract | orchestrator
  action      text not null,               -- what happened (short label)
  details     text,                        -- longer description
  lead_id     uuid references leads(id) on delete set null,
  level       text default 'info',         -- info | success | warning | error
  created_at  timestamptz default now()
);

create index if not exists agent_logs_created_idx on agent_logs(created_at desc);
create index if not exists agent_logs_agent_idx on agent_logs(agent);
