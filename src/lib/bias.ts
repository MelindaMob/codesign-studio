export type BiasFlag = { persona_name: string; issue: string; severity: 'low' | 'medium' | 'high'; element_id: string | null }
export type BiasReport = {
  id: string
  session_id: string
  diversity_score: number
  flags: { summary: string; items: BiasFlag[] }
  created_at: string
}

export async function runBiasCheck(sessionId: string): Promise<BiasReport> {
  const res = await fetch('/api/bias-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Analyse impossible')
  return data.report as BiasReport
}
