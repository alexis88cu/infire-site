export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [kpisRes, leadsRes, contractsRes, clientsRes] = await Promise.all([
    db.from('agency_kpis').select('*').single(),
    db.from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('contracts')
      .select('*, leads(business_name, phone, niche, city)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false }),
    db.from('clients')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ])

  // agent_logs is optional — table may not exist yet
  const logsRes = await db.from('agent_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    kpis: kpisRes.data,
    leads: leadsRes.data ?? [],
    pendingContracts: contractsRes.data ?? [],
    clients: clientsRes.data ?? [],
    logs: logsRes.data ?? [],
  })
}
