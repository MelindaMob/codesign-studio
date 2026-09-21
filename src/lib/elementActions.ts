import { createClient } from '@/lib/supabase/client'
import { logEvent } from '@/lib/events'
import { levenshtein } from '@/lib/editDistance'
import type { ElementKind } from '@/lib/schemas'

// Contexte commun à toutes les actions : la session et son mode d'autonomie
export type ActionCtx = { sessionId: string; mode: 'suggest' | 'draft' | 'act' }

type Status = 'proposed' | 'validated' | 'rejected'
type Columns = Partial<{ priority_impact: number | null; priority_effort: number | null }>

const now = () => new Date().toISOString()

async function nextVersion(elementId: string, branch = 'main') {
  const supabase = createClient()
  const { data } = await supabase
    .from('element_versions')
    .select('version_number')
    .eq('element_id', elementId)
    .eq('branch', branch)
    .order('version_number', { ascending: false })
    .limit(1)
  return (data?.[0]?.version_number ?? 0) + 1
}

// Accepter (validated), rejeter (rejected) ou remettre en attente (proposed)
export async function setStatus(ctx: ActionCtx, elementId: string, status: Status) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('elements')
    .update({ status, updated_at: now() })
    .eq('id', elementId)
    .select()
    .single()
  if (error) throw new Error(error.message)

  const type =
    status === 'validated' ? 'card_accepted' : status === 'rejected' ? 'card_rejected' : 'card_restored'
  await logEvent({ ...ctx, type, elementId })
  return data
}

// Modifier le contenu : nouvelle version "human" + event avec avant/après et distance d'édition
export async function editElement(
  ctx: ActionCtx,
  element: { id: string; content: unknown; source: string },
  newContent: Record<string, unknown>,
  columns: Columns = {}
) {
  const supabase = createClient()
  const before = JSON.stringify(element.content)
  const after = JSON.stringify(newContent)
  const contentChanged = before !== after

  const { data, error } = await supabase
    .from('elements')
    .update({
      content: newContent,
      ...columns,
      source: element.source === 'human_created' ? 'human_created' : 'human_edited',
      updated_at: now(),
    })
    .eq('id', element.id)
    .select()
    .single()
  if (error) throw new Error(error.message)

  if (contentChanged) {
    await supabase.from('element_versions').insert({
      element_id: element.id,
      session_id: ctx.sessionId,
      version_number: await nextVersion(element.id),
      branch: 'main',
      content: newContent,
      author: 'human',
    })

    const distance = levenshtein(before, after)
    await logEvent({
      ...ctx,
      type: 'card_edited',
      elementId: element.id,
      payload: {
        before: element.content,
        after: newContent,
        distance,
        ratio: Number((distance / Math.max(before.length, after.length, 1)).toFixed(3)),
      },
    })
  }

  return data
}

// Créer un élément à la main (source = human_created, validé d'office)
export async function createElement(
  ctx: ActionCtx,
  type: ElementKind,
  content: Record<string, unknown>,
  columns: Columns = {}
) {
  const supabase = createClient()

  const { count } = await supabase
    .from('elements')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', ctx.sessionId)
    .eq('type', type)

  const { data, error } = await supabase
    .from('elements')
    .insert({
      session_id: ctx.sessionId,
      type,
      content,
      ...columns,
      source: 'human_created',
      status: 'validated',
      position: count ?? 0,
    })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Création impossible')

  await supabase.from('element_versions').insert({
    element_id: data.id,
    session_id: ctx.sessionId,
    version_number: 1,
    branch: 'main',
    content,
    author: 'human',
  })

  await logEvent({ ...ctx, type: 'card_created', elementId: data.id, payload: { type } })
  return data
}

// Prioriser une feature (drag & drop sur la matrice impact / effort)
export async function setPriority(
  ctx: ActionCtx,
  element: { id: string; priority_impact: number | null; priority_effort: number | null },
  impact: number,
  effort: number
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('elements')
    .update({ priority_impact: impact, priority_effort: effort, updated_at: now() })
    .eq('id', element.id)
    .select()
    .single()
  if (error) throw new Error(error.message)

  await logEvent({
    ...ctx,
    type: 'card_prioritized',
    elementId: element.id,
    payload: {
      from: { impact: element.priority_impact, effort: element.priority_effort },
      to: { impact, effort },
    },
  })
  return data
}

// Ouverture du bouton "Pourquoi ça ?"
export async function logExplainOpened(ctx: ActionCtx, elementId: string) {
  await logEvent({ ...ctx, type: 'explain_opened', elementId })
}

// Changement de mode d'autonomie : met à jour la session + event
export async function changeMode(ctx: ActionCtx, newMode: ActionCtx['mode']) {
  if (newMode === ctx.mode) return
  const supabase = createClient()
  const { error } = await supabase.from('sessions').update({ mode: newMode }).eq('id', ctx.sessionId)
  if (error) throw new Error(error.message)
  await logEvent({
    sessionId: ctx.sessionId,
    mode: newMode,
    type: 'mode_changed',
    payload: { from: ctx.mode, to: newMode },
  })
}

// Mode Act : l'IA valide elle-même ses éléments (event distinct de card_accepted)
export async function autoAccept(ctx: ActionCtx, elementId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('elements')
    .update({ status: 'validated', updated_at: now() })
    .eq('id', elementId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  await logEvent({ ...ctx, type: 'card_auto_accepted', elementId })
  return data
}

// Audit : l'humain annule un élément auto-validé par l'IA
export async function undoAuto(ctx: ActionCtx, elementId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('elements')
    .update({ status: 'rejected', updated_at: now() })
    .eq('id', elementId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  await logEvent({ ...ctx, type: 'card_undone', elementId })
  return data
}

// Mode Suggest : suivi de l'usage des pistes proposées
export async function logSuggestionUsed(ctx: ActionCtx, payload: { type: ElementKind; label: string }) {
  await logEvent({ ...ctx, type: 'suggestion_used', payload })
}

export async function logSuggestionDismissed(ctx: ActionCtx, payload: { type: ElementKind; label: string }) {
  await logEvent({ ...ctx, type: 'suggestion_dismissed', payload })
}
