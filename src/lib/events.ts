import { createClient } from '@/lib/supabase/client'

export type EventType =
  | 'session_started'
  | 'mode_changed'
  | 'card_generated'
  | 'card_accepted'
  | 'card_rejected'
  | 'card_edited'
  | 'card_regenerated'
  | 'explain_opened'
  | 'card_created'
  | 'card_restored'
  | 'card_prioritized'
  | 'card_auto_accepted'
  | 'card_undone'
  | 'suggestion_shown'
  | 'suggestion_used'
  | 'suggestion_dismissed'
  | 'pipeline_started'
  | 'pipeline_completed'
  | 'agent_arbitration'
  | 'bias_alert_shown'
  | 'bias_alert_acted'

export async function logEvent(e: {
  sessionId: string
  mode: 'suggest' | 'draft' | 'act'
  type: EventType
  elementId?: string
  payload?: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from('events').insert({
    session_id: e.sessionId,
    user_id: user?.id,
    mode: e.mode,
    event_type: e.type,
    element_id: e.elementId ?? null,
    payload: e.payload ?? {},
  })
  if (error) {
    console.error('logEvent failed:', error, e)
    return { ok: false, error }
  }
  return { ok: true }
}
