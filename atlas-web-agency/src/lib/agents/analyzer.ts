/**
 * Analyzer Agent
 * Uses Claude to:
 * 1. Score and prioritize new leads
 * 2. Classify incoming WhatsApp/email replies
 * 3. Generate personalized outreach copy
 * 4. Generate demo content for a specific business
 */

import Anthropic from '@anthropic-ai/sdk'
import { db, Lead } from '../db'
import { log } from '../logger'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Score + Enrich a lead ────────────────────────────────────────────────────

export async function analyzeLead(lead: Lead): Promise<{
  leadScore: number
  notes: string
  bestChannel: string
  ownerName: string | null
}> {
  const prompt = `You are the Lead Analyzer for Atlas Web Agency. Score this Florida local business lead.

Business: ${lead.business_name}
Niche: ${lead.niche}
City: ${lead.city}
Website: ${lead.website_url ?? 'NONE'}
Website Score: ${lead.website_score}/10
Google Rating: ${lead.google_rating ?? 'unknown'} (${lead.google_reviews ?? 0} reviews)
Phone: ${lead.phone ?? 'not found'}
Email: ${lead.email ?? 'not found'}

Respond with JSON only:
{
  "lead_score": <1-10 integer>,
  "notes": "<one sentence: main opportunity and approach>",
  "best_channel": "<whatsapp|email|both>",
  "owner_name": "<guess a plausible first name based on business name, or null>"
}`

  const res = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const json = JSON.parse(text.replace(/```json|```/g, '').trim())

  return {
    leadScore: json.lead_score,
    notes: json.notes,
    bestChannel: json.best_channel,
    ownerName: json.owner_name,
  }
}

// ─── Classify incoming reply ──────────────────────────────────────────────────

export type ReplyIntent =
  | 'interested'
  | 'not_interested'
  | 'needs_info'
  | 'ready_to_buy'
  | 'spam'

export async function classifyReply(
  message: string,
  leadName: string,
  niche: string
): Promise<{ intent: ReplyIntent; suggestedReply: string }> {
  const prompt = `You are the reply handler for Atlas Web Agency.

A lead just replied to our outreach message. Classify their intent and draft a short reply.

Lead name: ${leadName}
Business niche: ${niche}
Their message: "${message}"

Intent options: interested | not_interested | needs_info | ready_to_buy | spam

Reply as JSON:
{
  "intent": "<intent>",
  "suggested_reply": "<short friendly reply from Alexis, 2-3 sentences max, mentioning demo link as [DEMO_URL]>"
}`

  const res = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const json = JSON.parse(text.replace(/```json|```/g, '').trim())

  return {
    intent: json.intent as ReplyIntent,
    suggestedReply: json.suggested_reply,
  }
}

// ─── Generate personalized outreach copy ─────────────────────────────────────

export async function generateOutreachCopy(lead: Lead, demoUrl: string): Promise<{
  emailSubject: string
  emailBody: string
  whatsappBody: string
}> {
  const prompt = `You are the Outreach Agent for Atlas Web Agency. Write personalized outreach for this lead.

Business: ${lead.business_name}
Owner: ${lead.owner_name ?? 'there'}
Niche: ${lead.niche}
City: ${lead.city}
Website: ${lead.website_url ?? 'NONE — no website at all'}
Rating: ${lead.google_rating ?? 'N/A'} stars (${lead.google_reviews ?? 0} reviews)
Notes: ${lead.notes ?? ''}
Demo URL: ${demoUrl}

Rules:
- NEVER say "we build websites." ALWAYS say "we already built a demo for your business."
- Keep it short and personal
- Reference specific details (rating, city, niche)
- Tone: friendly, casual, helpful — not salesy

Respond as JSON only:
{
  "email_subject": "<subject line>",
  "email_body": "<plain text email, 4-6 lines max>",
  "whatsapp_body": "<whatsapp message, 3-5 lines, use emojis sparingly>"
}`

  const res = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const json = JSON.parse(text.replace(/```json|```/g, '').trim())

  return {
    emailSubject: json.email_subject,
    emailBody: json.email_body,
    whatsappBody: json.whatsapp_body,
  }
}

// ─── Generate demo page content ───────────────────────────────────────────────

export async function generateDemoContent(lead: Lead): Promise<{
  tagline: string
  description: string
  services: string[]
  ctaText: string
  colorScheme: string
}> {
  const prompt = `Generate website demo content for a ${lead.niche} business.

Business name: ${lead.business_name}
City: ${lead.city}
Rating: ${lead.google_rating ?? 'N/A'} (${lead.google_reviews ?? 0} reviews)

Return JSON only:
{
  "tagline": "<short powerful headline>",
  "description": "<2 sentence business description>",
  "services": ["<service 1>", "<service 2>", "<service 3>", "<service 4>"],
  "cta_text": "<call to action button text>",
  "color_scheme": "<blue|green|red|orange|purple — pick best for niche>"
}`

  const res = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (res.content[0] as { text: string }).text.trim()
  const json = JSON.parse(text.replace(/```json|```/g, '').trim())

  // Save demo to DB
  const slug = lead.business_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  await db.from('demos').upsert({
    lead_id: lead.id,
    slug,
    niche: lead.niche,
    content: {
      businessName: lead.business_name,
      city: lead.city,
      phone: lead.phone,
      tagline: json.tagline,
      description: json.description,
      services: json.services,
      ctaText: json.cta_text,
      colorScheme: json.color_scheme,
      rating: lead.google_rating,
      reviews: lead.google_reviews,
    },
  }, { onConflict: 'lead_id' })

  return {
    tagline: json.tagline,
    description: json.description,
    services: json.services,
    ctaText: json.cta_text,
    colorScheme: json.color_scheme,
  }
}

// ─── Batch: analyze all new leads ────────────────────────────────────────────

export async function analyzeNewLeads(): Promise<number> {
  const { data: leads } = await db
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .is('lead_score', null)
    .limit(20)

  if (!leads?.length) return 0

  let processed = 0

  for (const lead of leads as Lead[]) {
    const analysis = await analyzeLead(lead)
    await db.from('leads').update({
      lead_score: analysis.leadScore,
      notes: analysis.notes,
      owner_name: analysis.ownerName,
    }).eq('id', lead.id)
    processed++
    const emoji = analysis.leadScore >= 8 ? '🔥' : analysis.leadScore >= 6 ? '⭐' : '👎'
    await log('analyzer', 'Lead scored', `${emoji} ${lead.business_name} — score ${analysis.leadScore}/10. ${analysis.notes}`, { lead_id: lead.id, level: analysis.leadScore >= 7 ? 'success' : 'info' })
  }

  await log('analyzer', 'Scoring complete', `${processed} leads analyzed`)
  console.log(`[Analyzer] Scored ${processed} new leads`)
  return processed
}
