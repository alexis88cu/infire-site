'use client'

import { useEffect, useState } from 'react'

interface KPIs {
  leads_this_week: number
  demos_sent_this_week: number
  replies_this_week: number
  total_clients: number
  current_mrr: number
  contracts_pending: number
  hot_leads: number
}

interface Lead {
  id: string
  business_name: string
  owner_name: string | null
  phone: string | null
  niche: string | null
  city: string | null
  website_score: number | null
  lead_score: number | null
  status: string
  demo_url: string | null
  created_at: string
}

interface PendingContract {
  id: string
  plan: string
  setup_fee: number
  monthly_fee: number
  status: string
  created_at: string
  leads: { business_name: string; phone: string | null; niche: string | null; city: string | null }
}

interface Client {
  id: string
  business_name: string
  plan: string
  monthly_amount: number
  status: string
  start_date: string
  website_url: string | null
}

interface AgentLog {
  id: string
  agent: string
  action: string
  details: string | null
  level: string
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-700 text-slate-200',
  demo_sent: 'bg-blue-900 text-blue-200',
  interested: 'bg-yellow-900 text-yellow-200',
  proposal_sent: 'bg-purple-900 text-purple-200',
  contract_pending: 'bg-orange-900 text-orange-200',
  client: 'bg-green-900 text-green-200',
  lost: 'bg-red-900 text-red-300',
}

const PIPELINE_STAGES = ['new', 'demo_sent', 'interested', 'contract_pending', 'client']

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [contracts, setContracts] = useState<PendingContract[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [activeTab, setActiveTab] = useState<'pipeline' | 'contracts' | 'clients' | 'activity'>('contracts')
  const [approving, setApproving] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [running, setRunning] = useState(false)
  const [pipelineResult, setPipelineResult] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/dashboard')
    const data = await res.json()
    setKpis(data.kpis)
    setLeads(data.leads ?? [])
    setContracts(data.pendingContracts ?? [])
    setClients(data.clients ?? [])
    setLogs(data.logs ?? [])
  }

  useEffect(() => { load() }, [])

  async function runPipeline() {
    setRunning(true)
    setPipelineResult(null)
    try {
      const res = await fetch('/api/pipeline/run', { method: 'POST' })
      const data = await res.json()
      if (data.result) {
        const r = data.result
        setPipelineResult(`✅ Done — Leads: ${r.newLeads} | Scored: ${r.scored} | Outreach: ${r.outreachSent} | Follow-ups: ${r.followUpsSent} | Contracts: ${r.contractsGenerated}`)
      } else {
        setPipelineResult(`❌ ${JSON.stringify(data)}`)
      }
      await load()
    } catch (e) {
      setPipelineResult(`❌ Error: ${String(e)}`)
    }
    setRunning(false)
  }

  async function approveContract(contractId: string) {
    setApproving(contractId)
    await fetch(`/api/contracts/${contractId}/approve`, { method: 'POST' })
    await load()
    setApproving(null)
  }

  const filteredLeads = filterStatus === 'all'
    ? leads
    : leads.filter((l) => l.status === filterStatus)

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-sm">A</div>
          <span className="font-bold text-lg">Atlas Agency OS</span>
          <span className="text-xs text-slate-400 ml-2">Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {contracts.length > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
              {contracts.length} contract{contracts.length > 1 ? 's' : ''} waiting approval
            </span>
          )}
          <button
            onClick={runPipeline}
            disabled={running}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-all"
          >
            {running ? '⏳ Running...' : '▶ Run Pipeline'}
          </button>
          <button
            onClick={load}
            className="text-xs text-slate-400 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="px-8 py-8 max-w-7xl mx-auto">
        {/* Pipeline result */}
        {pipelineResult && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm font-mono border ${pipelineResult.startsWith('✅') ? 'bg-green-950 border-green-700 text-green-300' : 'bg-red-950 border-red-700 text-red-300'}`}>
            {pipelineResult}
          </div>
        )}

        {/* KPI Row */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-10">
            {[
              { label: 'Leads / week', value: kpis.leads_this_week, color: 'text-blue-400' },
              { label: 'Demos sent', value: kpis.demos_sent_this_week, color: 'text-purple-400' },
              { label: 'Replies', value: kpis.replies_this_week, color: 'text-yellow-400' },
              { label: 'Hot leads', value: kpis.hot_leads, color: 'text-orange-400' },
              { label: 'Contracts', value: kpis.contracts_pending, color: 'text-red-400' },
              { label: 'Clients', value: kpis.total_clients, color: 'text-green-400' },
              { label: 'MRR', value: `$${Number(kpis.current_mrr).toFixed(0)}`, color: 'text-emerald-400' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-slate-400 mt-1">{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
          {[
            { id: 'contracts', label: `Contracts to Approve${contracts.length ? ` (${contracts.length})` : ''}` },
            { id: 'pipeline', label: 'Lead Pipeline' },
            { id: 'clients', label: `Clients (${clients.length})` },
            { id: 'activity', label: `Activity Log${logs.length ? ` (${logs.length})` : ''}` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── CONTRACTS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'contracts' && (
          <div>
            {contracts.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <div className="text-4xl mb-3">✅</div>
                <p>No contracts pending approval.</p>
                <p className="text-sm mt-1">New contracts will appear here automatically when leads reply.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {contracts.map((c) => (
                  <div key={c.id} className="bg-white/5 border border-orange-500/30 rounded-2xl p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold">{c.leads.business_name}</h3>
                          <span className="text-xs bg-orange-900 text-orange-200 px-2 py-0.5 rounded-full uppercase font-bold">
                            {c.plan}
                          </span>
                        </div>
                        <div className="text-sm text-slate-400 space-y-1">
                          <div>📍 {c.leads.city} · {c.leads.niche}</div>
                          <div>📞 {c.leads.phone}</div>
                          <div className="mt-2 text-white">
                            <span className="text-green-400 font-bold">${c.setup_fee}</span> setup ·{' '}
                            <span className="text-blue-400 font-bold">${c.monthly_fee}/mo</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => approveContract(c.id)}
                          disabled={approving === c.id}
                          className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all"
                        >
                          {approving === c.id ? (
                            <span>Sending...</span>
                          ) : (
                            <>✅ Approve &amp; Send</>
                          )}
                        </button>
                        <a
                          href={`/dashboard/contracts/${c.id}`}
                          className="text-center text-xs text-slate-400 hover:text-white underline"
                        >
                          Review contract
                        </a>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Generated {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── PIPELINE TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'pipeline' && (
          <div>
            {/* Status filter */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {['all', ...PIPELINE_STAGES].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    filterStatus === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {s === 'all' ? `All (${leads.length})` : s.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                    <th className="text-left px-4 py-3">Business</th>
                    <th className="text-left px-4 py-3">Niche / City</th>
                    <th className="text-left px-4 py-3">Score</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Demo</th>
                    <th className="text-left px-4 py-3">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{lead.business_name}</div>
                        <div className="text-slate-400 text-xs">{lead.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div>{lead.niche}</div>
                        <div className="text-xs text-slate-500">{lead.city}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {lead.lead_score && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              lead.lead_score >= 8 ? 'bg-green-900 text-green-300' :
                              lead.lead_score >= 6 ? 'bg-yellow-900 text-yellow-300' :
                              'bg-red-900 text-red-300'
                            }`}>
                              {lead.lead_score}/10
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[lead.status] ?? 'bg-slate-700 text-slate-300'}`}>
                          {lead.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.demo_url ? (
                          <a
                            href={lead.demo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline text-xs"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── ACTIVITY TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div>
            {logs.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <div className="text-4xl mb-3">🤖</div>
                <p>No agent activity yet.</p>
                <p className="text-sm mt-1">Run the pipeline to see what the agents are doing.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((entry) => {
                  const levelStyle =
                    entry.level === 'success' ? 'border-green-700/40 bg-green-950/30' :
                    entry.level === 'warning' ? 'border-orange-700/40 bg-orange-950/30' :
                    entry.level === 'error'   ? 'border-red-700/40 bg-red-950/30' :
                    'border-white/10 bg-white/5'
                  const agentColor: Record<string, string> = {
                    scout:        'bg-blue-900 text-blue-300',
                    analyzer:     'bg-purple-900 text-purple-300',
                    outreach:     'bg-yellow-900 text-yellow-300',
                    contract:     'bg-orange-900 text-orange-300',
                    orchestrator: 'bg-slate-700 text-slate-300',
                  }
                  return (
                    <div key={entry.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${levelStyle}`}>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${agentColor[entry.agent] ?? 'bg-slate-700 text-slate-300'}`}>
                        {entry.agent}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{entry.action}</div>
                        {entry.details && <div className="text-xs text-slate-400 mt-0.5 truncate">{entry.details}</div>}
                      </div>
                      <div className="text-xs text-slate-500 shrink-0">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── CLIENTS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'clients' && (
          <div>
            {clients.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <div className="text-4xl mb-3">🚀</div>
                <p>No active clients yet. Keep working the pipeline!</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                      <th className="text-left px-4 py-3">Business</th>
                      <th className="text-left px-4 py-3">Plan</th>
                      <th className="text-left px-4 py-3">Monthly</th>
                      <th className="text-left px-4 py-3">Website</th>
                      <th className="text-left px-4 py-3">Start Date</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-semibold">{client.business_name}</td>
                        <td className="px-4 py-3 text-slate-300 capitalize">{client.plan}</td>
                        <td className="px-4 py-3 text-green-400 font-bold">${client.monthly_amount}/mo</td>
                        <td className="px-4 py-3">
                          {client.website_url ? (
                            <a href={client.website_url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline text-xs">
                              Visit
                            </a>
                          ) : <span className="text-slate-600">Pending</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{client.start_date}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            client.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                          }`}>
                            {client.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
