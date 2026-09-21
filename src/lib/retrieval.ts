import type { SupabaseClient } from '@supabase/supabase-js'
import { embedTexts } from '@/lib/embeddings'
import type { ElementKind } from '@/lib/schemas'
import type { PromptSource } from '@/lib/prompts'

export type Source = PromptSource & { id: string }

// Requête ajoutée au brief pour chercher les bons passages dans les documents
const RETRIEVAL_QUERY: Record<ElementKind, string> = {
  persona: 'user profiles, needs, goals, frustrations, behaviors, quotes',
  journey: 'user steps, pain points, moments of friction, emotions',
  feature: 'user requests, unmet needs, opportunities, requirements',
}

// Renvoie les passages de documents les plus proches du brief (tableau vide s'il n'y a pas de documents).
// Lève une erreur si les embeddings ou la recherche échouent.
export async function retrieveSources(
  supabase: SupabaseClient,
  args: { sessionId: string; type: ElementKind; brief: string; hint?: string; limit?: number }
): Promise<Source[]> {
  const { sessionId, type, brief, hint, limit = 8 } = args

  const { data: docs } = await supabase.from('documents').select('id, filename').eq('session_id', sessionId)
  if (!docs?.length) return []

  const query = [RETRIEVAL_QUERY[type], brief, hint].filter(Boolean).join('\n')
  const [queryEmbedding] = await embedTexts([query])

  const { data: matches, error } = await supabase.rpc('match_chunks', {
    sid: sessionId,
    query_embedding: queryEmbedding,
    match_count: limit,
  })
  if (error) throw new Error(error.message)

  const names = new Map<string, string>(docs.map((d) => [d.id as string, d.filename as string]))

  return (
    (matches ?? []) as { id: string; document_id: string; content: string; page: number | null }[]
  ).map((m, i) => ({
    ref: `S${i + 1}`,
    id: m.id,
    content: m.content,
    page: m.page,
    filename: names.get(m.document_id),
  }))
}
