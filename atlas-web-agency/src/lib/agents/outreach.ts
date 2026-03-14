/**
 * Outreach Agent
 * Sends WhatsApp Business + Email messages to leads.
 * Handles initial contact and day-3 / day-7 follow-ups.
 */

import { db, Lead } from '../db'
import { generateOutreachCopy, generateDemoContent } from './analyzer'
import { log } from '../logger'

const DEMO_BASE_URL = 'https://atlaswebagency.net/demo'
const OWNER_PHONE = process.env.OWNER_WHATSAPP_PHONE!  // e.g. 17864353507
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!
const RESEND_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = 'Alexis @ Atlas Web Agency <alexis@atlaswebagency.net>'

// ─── WhatsApp Business Cloud API ─────────────────────────────────────────────

export async function sendWhatsApp(to: string, body: string): Promise<string | null> {
  const phone = to.replace(/\D/g, '')
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[WhatsApp] Send failed:', data)
    return null
  }

  return data.messages?.[0]?.id ?? null
}

// ─── Resend Email ─────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('[Email] Send failed:', err)
    return false
  }

  return true
}

// ─── Notify owner on WhatsApp ─────────────────────────────────────────────────

export async function notifyOwner(message: string): Promise<void> {
  if (!OWNER_PHONE) return
  await sendWhatsApp(OWNER_PHONE, message)
}

// ─── Send initial outreach to a lead ─────────────────────────────────────────

export async function sendInitialOutreach(lead: Lead): Promise<boolean> {
  // 1. Generate demo content
  const demo = await generateDemoContent(lead)
  const slug = lead.business_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const demoUrl = `${DEMO_BASE_URL}/${slug}`

  // Update demo_url on lead
  await db.from('leads').update({ demo_url: demoUrl }).eq('id', lead.id)

  // 2. Generate personalized copy
  const copy = await generateOutreachCopy({ ...lead, demo_url: demoUrl }, demoUrl)

  let sent = false

  // 3. Send WhatsApp if phone available
  if (lead.phone) {
    const waId = await sendWhatsApp(lead.phone, copy.whatsappBody)
    if (waId) {
      await db.from('messages').insert({
        lead_id: lead.id,
        channel: 'whatsapp',
        direction: 'outbound',
        body: copy.whatsappBody,
        wa_msg_id: waId,
      })
      sent = true
    }
  }

  // 4. Send email if address available
  if (lead.email) {
    const ok = await sendEmail(lead.email, copy.emailSubject, copy.emailBody)
    if (ok) {
      await db.from('messages').insert({
        lead_id: lead.id,
        channel: 'email',
        direction: 'outbound',
        subject: copy.emailSubject,
        body: copy.emailBody,
      })
      sent = true
    }
  }

  if (sent) {
    const followUpAt = new Date()
    followUpAt.setDate(followUpAt.getDate() + 3)

    await db.from('leads').update({
      status: 'demo_sent',
      last_contacted_at: new Date().toISOString(),
      follow_up_at: followUpAt.toISOString(),
    }).eq('id', lead.id)

    await log('outreach', 'Initial outreach sent', `Demo sent to ${lead.business_name} (${lead.niche}, ${lead.city}) → ${demoUrl}`, { lead_id: lead.id, level: 'success' })
    console.log(`[Outreach] Sent to ${lead.business_name} | demo: ${demoUrl}`)
  }

  return sent
}

// ─── Follow-up messages ───────────────────────────────────────────────────────

async function sendFollowUp(lead: Lead, attempt: 1 | 2): Promise<void> {
  const name = lead.owner_name ?? 'there'
  const demoUrl = lead.demo_url ?? `${DEMO_BASE_URL}/${lead.business_name.toLowerCase().replace(/\s+/g, '-')}`

  let body: string

  if (attempt === 1) {
    body = `Hi ${name}, just wanted to make sure you saw the demo I created for ${lead.business_name}:\n👉 ${demoUrl}\n\nHappy to make any changes or answer questions! 😊`
  } else {
    body = `Last follow-up from me — I know you're busy running your business.\n\nThe demo is still available:\n👉 ${demoUrl}\n\n✅ $250 setup\n✅ $14.99/month (hosting + maintenance)\n✅ Launch in 5–7 days\n\nReach out anytime. 🙌`
  }

  if (lead.phone) {
    const waId = await sendWhatsApp(lead.phone, body)
    if (waId) {
      await db.from('messages').insert({
        lead_id: lead.id,
        channel: 'whatsapp',
        direction: 'outbound',
        body,
        wa_msg_id: waId,
      })
    }
  }

  // Set next follow-up or mark as lost after 2 attempts
  if (attempt === 1) {
    const next = new Date()
    next.setDate(next.getDate() + 4)
    await db.from('leads').update({
      last_contacted_at: new Date().toISOString(),
      follow_up_at: next.toISOString(),
    }).eq('id', lead.id)
  } else {
    await db.from('leads').update({
      last_contacted_at: new Date().toISOString(),
      follow_up_at: null,
      status: 'lost',
    }).eq('id', lead.id)
  }

  await log('outreach', `Follow-up #${attempt} sent`, `${lead.business_name} — ${attempt === 2 ? 'final follow-up, marking as lost if no reply' : 'day-3 follow-up'}`, { lead_id: lead.id, level: 'info' })
  console.log(`[Outreach] Follow-up #${attempt} sent to ${lead.business_name}`)
}

// ─── Daily outreach run ───────────────────────────────────────────────────────

export async function runOutreachAgent(): Promise<{ sent: number; followUps: number }> {
  let sent = 0
  let followUps = 0

  // 1. Send initial outreach to qualified new leads
  const { data: newLeads } = await db
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .gte('lead_score', 7)
    .limit(10)

  for (const lead of (newLeads ?? []) as Lead[]) {
    const ok = await sendInitialOutreach(lead)
    if (ok) sent++
    await new Promise((r) => setTimeout(r, 1500)) // rate limit
  }

  // 2. Follow-ups due today
  const now = new Date().toISOString()
  const { data: dueLeads } = await db
    .from('leads')
    .select('*')
    .lte('follow_up_at', now)
    .not('follow_up_at', 'is', null)
    .eq('status', 'demo_sent')

  for (const lead of (dueLeads ?? []) as Lead[]) {
    // Count previous messages to determine follow-up number
    const { count } = await db
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .eq('direction', 'outbound')

    const attempt = (count ?? 1) >= 2 ? 2 : 1
    await sendFollowUp(lead, attempt as 1 | 2)
    followUps++
    await new Promise((r) => setTimeout(r, 1000))
  }

  return { sent, followUps }
}
