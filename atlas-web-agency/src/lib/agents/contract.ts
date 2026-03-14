/**
 * Contract Agent
 * Generates service contracts for interested leads.
 * Contract goes to "pending_approval" — owner approves in dashboard.
 * After approval, sends to client via WhatsApp + email.
 */

import Anthropic from '@anthropic-ai/sdk'
import { db, Lead } from '../db'
import { notifyOwner } from './outreach'
import { log } from '../logger'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PLAN_CONFIG = {
  starter:      { setup: 250,  monthly: 14.99 },
  professional: { setup: 250,  monthly: 49.00 },
  premium:      { setup: 500,  monthly: 99.00 },
}

type Plan = keyof typeof PLAN_CONFIG

function detectPlan(notes: string | null, niche: string | null): Plan {
  const text = `${notes ?? ''} ${niche ?? ''}`.toLowerCase()
  if (text.includes('seo') || text.includes('premium') || text.includes('high value')) return 'premium'
  if (text.includes('professional') || text.includes('booking') || text.includes('ecommerce')) return 'professional'
  return 'starter'
}

export async function generateContract(lead: Lead, plan?: Plan): Promise<string> {
  const selectedPlan = plan ?? detectPlan(lead.notes, lead.niche)
  const config = PLAN_CONFIG[selectedPlan]
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const prompt = `Generate a professional service contract for Atlas Web Agency.

Client: ${lead.business_name}
Owner: ${lead.owner_name ?? 'Business Owner'}
Phone: ${lead.phone ?? 'TBD'}
Email: ${lead.email ?? 'TBD'}
City: ${lead.city ?? 'Florida'}
Plan: ${selectedPlan.toUpperCase()}
Setup Fee: $${config.setup} (one-time)
Monthly Fee: $${config.monthly}/month
Date: ${today}
Agency: Atlas Web Agency
Agency Contact: Alexis | atlaswebagency.net | +1 (786) 435-3507

Write a clean, professional contract covering:
1. Services included (website design, hosting, SSL, mobile responsive, contact form)
2. Payment terms (setup fee due before work starts; monthly via PayPal subscription)
3. Timeline (website live within 7 business days)
4. Revisions policy (2 rounds included)
5. Cancellation (30 days notice, no penalties)
6. Ownership (client owns all content; Atlas owns template license)
7. Signature lines

Format in clean markdown. Professional but readable.`

  const res = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const contractText = (res.content[0] as { text: string }).text

  // Save contract as draft
  const { data: contract } = await db.from('contracts').insert({
    lead_id: lead.id,
    plan: selectedPlan,
    setup_fee: config.setup,
    monthly_fee: config.monthly,
    status: 'pending_approval',
    content: contractText,
  }).select().single()

  if (contract) {
    await db.from('leads').update({ status: 'contract_pending' }).eq('id', lead.id)

    // Notify owner
    const dashboardUrl = `https://atlaswebagency.net/dashboard/contracts/${contract.id}`
    await notifyOwner(
      `🔔 New contract ready for approval!\n\n` +
      `Client: ${lead.business_name}\n` +
      `Plan: ${selectedPlan} — $${config.setup} + $${config.monthly}/mo\n\n` +
      `👉 Approve here: ${dashboardUrl}`
    )

    await log('contract', 'Contract ready for approval', `${lead.business_name} — ${selectedPlan} plan ($${config.setup} setup + $${config.monthly}/mo)`, { lead_id: lead.id, level: 'warning' })
    console.log(`[Contract] Draft created for ${lead.business_name} (${selectedPlan})`)
  }

  return contractText
}

export async function approveAndSendContract(contractId: string): Promise<boolean> {
  const { data: contract } = await db
    .from('contracts')
    .select('*, leads(*)')
    .eq('id', contractId)
    .single()

  if (!contract || contract.status !== 'pending_approval') return false

  const lead = contract.leads as Lead

  // Mark contract as approved
  await db.from('contracts').update({
    status: 'sent',
    approved_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
  }).eq('id', contractId)

  const message = `Hi ${lead.owner_name ?? 'there'}! 🎉\n\nGreat news — here's your service agreement for the ${contract.plan} plan:\n\n` +
    `📋 Contract summary:\n` +
    `• Setup fee: $${contract.setup_fee} (one-time)\n` +
    `• Monthly: $${contract.monthly_fee}/month\n` +
    `• Launch: 7 business days after payment\n\n` +
    `Reply "AGREE" to confirm and I'll send you the payment link to get started! 🚀`

  // Send via WhatsApp
  if (lead.phone) {
    const { sendWhatsApp } = await import('./outreach')
    const waId = await sendWhatsApp(lead.phone, message)
    if (waId) {
      await db.from('messages').insert({
        lead_id: lead.id,
        channel: 'whatsapp',
        direction: 'outbound',
        body: message,
        wa_msg_id: waId,
      })
    }
  }

  // Send via email
  if (lead.email) {
    const { sendEmail } = await import('./outreach')
    await sendEmail(
      lead.email,
      `Your Website Service Agreement — Atlas Web Agency`,
      `${message}\n\n---\nFull contract:\n\n${contract.content}`
    )
  }

  await log('contract', 'Contract sent to client', `${lead.business_name} — ${contract.plan} plan`, { lead_id: lead.id, level: 'success' })
  console.log(`[Contract] Sent to ${lead.business_name}`)
  return true
}
