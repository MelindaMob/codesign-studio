import type { ElementKind } from '@/lib/schemas'

export type Suggestion = { label: string; hint: string }

export async function fetchSuggestions(
  sessionId: string,
  type: ElementKind,
  count = 4
): Promise<Suggestion[]> {
  const res = await fetch('/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, type, count }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Suggestions impossibles')
  return data.suggestions as Suggestion[]
}
