/**
 * Agent activity logger — writes to agent_logs table in Supabase.
 */

import { db } from './db'

export type LogLevel = 'info' | 'success' | 'warning' | 'error'
export type AgentName = 'scout' | 'analyzer' | 'outreach' | 'contract' | 'orchestrator'

export async function log(
  agent: AgentName,
  action: string,
  details?: string,
  opts?: { lead_id?: string; level?: LogLevel }
): Promise<void> {
  const level = opts?.level ?? 'info'
  console.log(`[${agent.toUpperCase()}] ${action}${details ? ' — ' + details : ''}`)

  await db.from('agent_logs').insert({
    agent,
    action,
    details: details ?? null,
    lead_id: opts?.lead_id ?? null,
    level,
  }).then(({ error }) => {
    if (error) console.error('[Logger] Failed to write log:', error.message)
  })
}
