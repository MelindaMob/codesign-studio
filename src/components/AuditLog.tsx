'use client'

import { useEffect, useState } from 'react'
import type { StudioElement } from '@/components/ElementCard'
import { createClient } from '@/lib/supabase/client'

type EventRow = {
  id: string
  event_type: string
  element_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

function elementLabel(elements: StudioElement[], elementId: string | null) {
  if (!elementId) return 'élément'
  const element = elements.find((item) => item.id === elementId)
  const content = element?.content
  if (content && typeof content === 'object') {
    if (typeof content.name === 'string' && content.name.trim()) return content.name
    if (typeof content.title === 'string' && content.title.trim()) return content.title
  }
  return 'élément'
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function countFrom(payload: Record<string, unknown> | null) {
  const counts = payload?.counts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return 0
  return Object.values(counts as Record<string, unknown>).reduce(
    (sum: number, value) => sum + (typeof value === 'number' ? value : 0),
    0
  )
}

export function AuditLog({
  sessionId,
  elements,
  refreshKey,
  autoAcceptedIds,
  onUndo,
}: {
  sessionId: string
  elements: StudioElement[]
  refreshKey: number
  autoAcceptedIds: Set<string>
  onUndo: (elementId: string) => void
}) {
  const [rows, setRows] = useState<EventRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = createClient()
      const { data, error: loadError } = await supabase
        .from('events')
        .select('id, event_type, element_id, payload, created_at')
        .eq('session_id', sessionId)
        .in('event_type', [
          'pipeline_started',
          'pipeline_completed',
          'card_auto_accepted',
          'card_undone',
          'card_edited',
          'card_regenerated',
        ])
        .order('created_at', { ascending: false })
        .limit(30)

      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
        return
      }
      setError(null)
      setRows((data as EventRow[] | null) ?? [])
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, refreshKey])

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white p-6">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Journal d’audit</summary>
      <div className="mt-4 space-y-2">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {rows.length === 0 && !error ? (
          <p className="text-sm text-zinc-400">Aucun événement pour l’instant.</p>
        ) : null}
        {rows.map((row) => {
          const label = elementLabel(elements, row.element_id)
          const payload = row.payload
          const element = elements.find((item) => item.id === row.element_id)
          const canUndo =
            row.event_type === 'card_auto_accepted' &&
            Boolean(row.element_id) &&
            element?.status === 'validated' &&
            autoAcceptedIds.has(row.element_id as string)

          let text = row.event_type
          if (row.event_type === 'pipeline_started') text = 'Pipeline lancé'
          if (row.event_type === 'pipeline_completed') {
            text =
              payload?.completed === false
                ? `Pipeline interrompu : ${typeof payload.error === 'string' ? payload.error : 'erreur'}`
                : `Pipeline terminé : ${countFrom(payload)} éléments`
          }
          if (row.event_type === 'card_auto_accepted') text = `L’IA a validé automatiquement « ${label} »`
          if (row.event_type === 'card_undone') text = `Tu as annulé « ${label} »`
          if (row.event_type === 'card_edited') text = `Tu as modifié « ${label} »`
          if (row.event_type === 'card_regenerated') text = `L’IA a régénéré « ${label} »`

          return (
            <div key={row.id} className="flex items-start justify-between gap-3 text-sm">
              <p className="text-zinc-700">
                <span className="mr-2 font-medium text-zinc-400">{timeOf(row.created_at)}</span>
                {text}
              </p>
              {canUndo ? (
                <button
                  type="button"
                  onClick={() => onUndo(row.element_id as string)}
                  className="shrink-0 text-xs font-medium text-violet-700 hover:text-violet-900"
                >
                  Annuler
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}
