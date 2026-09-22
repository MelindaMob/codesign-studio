export type AgentRole = 'ux_researcher' | 'product_manager' | 'tech_lead'
export type Stance = 'agree' | 'concern' | 'alternative'
export type AgentOpinion = {
  id: string
  element_id: string
  agent_role: AgentRole
  stance: Stance
  comment: string
  created_at: string
}

export async function runDebate(elementId: string): Promise<{ opinions: AgentOpinion[]; partial: boolean; errors: string[] }> {
  const res = await fetch('/api/debate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ elementId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Débat impossible')
  return data
}
