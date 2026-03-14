/**
 * Scout Agent
 * Finds local businesses in Florida using Google Places API.
 * Only returns leads with score >= 7 (no website, broken, or outdated).
 */

import { db } from '../db'
import { log } from '../logger'

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY!

const NICHES = [
  'roofing contractor',
  'hvac repair',
  'plumber',
  'electrician',
  'dentist',
  'med spa',
  'restaurant',
  'barbershop',
  'cleaning service',
  'car detailing',
]

const CITIES = [
  'Miami, FL',
  'Fort Lauderdale, FL',
  'Hialeah, FL',
  'Doral, FL',
  'Coral Gables, FL',
  'Hollywood, FL',
  'Pembroke Pines, FL',
  'Boca Raton, FL',
  'Orlando, FL',
  'Tampa, FL',
]

interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  formatted_phone_number?: string
  website?: string
  rating?: number
  user_ratings_total?: number
}

async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const fields = 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total'
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_PLACES_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK') return null
  return data.result
}

async function searchPlaces(query: string, city: string): Promise<string[]> {
  const textQuery = encodeURIComponent(`${query} in ${city}`)
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${textQuery}&key=${GOOGLE_PLACES_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK') return []
  return (data.results as { place_id: string }[]).slice(0, 5).map((r) => r.place_id)
}

function scoreWebsite(websiteUrl: string | undefined): number {
  if (!websiteUrl) return 10  // No website = perfect lead
  if (websiteUrl.includes('facebook.com') || websiteUrl.includes('yelp.com')) return 9
  // Basic heuristic — real scoring happens in the analyzer agent
  return 6
}

function cityFromAddress(address: string): string {
  const parts = address.split(',')
  return parts.length >= 2 ? parts[parts.length - 2].trim() : address
}

export async function runScoutAgent(maxLeads = 20): Promise<number> {
  let found = 0

  await log('scout', 'Pipeline started', `Searching for up to ${maxLeads} leads across Florida`)

  for (const niche of NICHES) {
    if (found >= maxLeads) break

    const city = CITIES[Math.floor(Math.random() * CITIES.length)]
    const placeIds = await searchPlaces(niche, city)

    for (const placeId of placeIds) {
      if (found >= maxLeads) break

      // Skip if already in DB
      const { data: existing } = await db
        .from('leads')
        .select('id')
        .eq('google_place_id', placeId)
        .single()

      if (existing) continue

      const place = await getPlaceDetails(placeId)
      if (!place) continue

      const websiteScore = scoreWebsite(place.website)
      if (websiteScore < 7) continue  // Skip well-built sites

      const { error } = await db.from('leads').insert({
        business_name: place.name,
        phone: place.formatted_phone_number ?? null,
        email: null,  // enriched later by analyzer
        address: place.formatted_address,
        city: cityFromAddress(place.formatted_address),
        niche,
        website_url: place.website ?? null,
        google_rating: place.rating ?? null,
        google_reviews: place.user_ratings_total ?? null,
        google_place_id: place.place_id,
        website_score: websiteScore,
        status: 'new',
      })

      if (!error) {
        found++
        console.log(`[Scout] Found: ${place.name} (${niche}, ${city}) score=${websiteScore}`)
        await log('scout', 'Lead found', `${place.name} — ${niche} in ${city} (website score: ${websiteScore}/10)`, { level: 'success' })
      }
    }
  }

  await log('scout', 'Search complete', `${found} new leads added to pipeline`, { level: found > 0 ? 'success' : 'info' })
  console.log(`[Scout] Done — ${found} new leads added`)
  return found
}
