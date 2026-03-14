/**
 * Orchestrator — Master Pipeline
 * Called by the daily cron job.
 * Runs all agents in sequence.
 */

import { runScoutAgent } from './scout'
import { analyzeNewLeads } from './analyzer'
import { runOutreachAgent } from './outreach'
import { generateContract } from './contract'
import { db } from '../db'
import { Lead } from '../db'
import { log } from '../logger'

export interface PipelineResult {
  newLeads: number
  scored: number
  outreachSent: number
  followUpsSent: number
  contractsGenerated: number
  timestamp: string
}

export async function runDailyPipeline(): Promise<PipelineResult> {
  console.log('[Orchestrator] Starting daily pipeline...')
  await log('orchestrator', 'Daily pipeline started', 'Running all agents: scout → analyzer → outreach → contracts')
  const start = Date.now()

  // Step 1: Scout — find new leads
  const newLeads = await runScoutAgent(20)

  // Step 2: Analyzer — score all unscored leads
  const scored = await analyzeNewLeads()

  // Step 3: Outreach — send messages + follow-ups
  const { sent: outreachSent, followUps: followUpsSent } = await runOutreachAgent()

  // Step 4: Contract generation — for leads that replied "interested"
  const { data: interestedLeads } = await db
    .from('leads')
    .select('*')
    .eq('status', 'interested')
    .is('demo_url', null)  // hasn't had contract generated yet

  // Actually check if they have no contract yet
  let contractsGenerated = 0
  for (const lead of (interestedLeads ?? []) as Lead[]) {
    const { count } = await db
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id)

    if (!count) {
      await generateContract(lead)
      contractsGenerated++
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  await log('orchestrator', 'Pipeline complete', `${elapsed}s — leads: ${newLeads} | scored: ${scored} | outreach: ${outreachSent} | follow-ups: ${followUpsSent} | contracts: ${contractsGenerated}`, { level: 'success' })
  console.log(`[Orchestrator] Done in ${elapsed}s — leads: ${newLeads}, scored: ${scored}, outreach: ${outreachSent}, followups: ${followUpsSent}, contracts: ${contractsGenerated}`)

  return {
    newLeads,
    scored,
    outreachSent,
    followUpsSent,
    contractsGenerated,
    timestamp: new Date().toISOString(),
  }
}
