import { generateElements } from '@/lib/generate'
import { autoAccept, type ActionCtx } from '@/lib/elementActions'
import { logEvent } from '@/lib/events'
import type { ElementKind } from '@/lib/schemas'

const STEPS: { type: ElementKind; count: number; label: string }[] = [
  { type: 'persona', count: 3, label: 'Personas' },
  { type: 'journey', count: 3, label: 'Parcours' },
  { type: 'feature', count: 4, label: 'Fonctionnalités' },
]

type Handlers = {
  onStep?: (label: string, index: number, total: number) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onElement: (el: any) => void
  onError?: (message: string) => void
}

// Mode Act : l'IA enchaîne personas, journeys et features en auto-validant chaque élément
export async function runPipeline(ctx: ActionCtx, handlers: Handlers) {
  const started = Date.now()
  const counts: Record<string, number> = {}
  await logEvent({ ...ctx, type: 'pipeline_started' })

  const fail = async (message: string) => {
    handlers.onError?.(message)
    await logEvent({ ...ctx, type: 'pipeline_completed', payload: { completed: false, error: message, counts } })
    return { ok: false as const, counts }
  }

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    handlers.onStep?.(step.label, i, STEPS.length)

    const state = { error: null as string | null }
    const pending: Promise<unknown>[] = []

    await generateElements({
      sessionId: ctx.sessionId,
      type: step.type,
      count: step.count,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onElement: (el: any) => {
        counts[step.type] = (counts[step.type] ?? 0) + 1
        pending.push(
          autoAccept(ctx, el.id)
            .then((row) => handlers.onElement({ ...el, ...row, citations: el.citations }))
            .catch(() => handlers.onElement(el))
        )
      },
      onError: (m) => {
        state.error = m
      },
    })

    // on attend que tout soit validé avant l'étape suivante (elle en dépend)
    await Promise.all(pending)

    if (state.error) return fail(state.error)
    if (!counts[step.type]) return fail(`Aucun élément généré à l'étape « ${step.label} »`)
  }

  await logEvent({
    ...ctx,
    type: 'pipeline_completed',
    payload: { completed: true, counts, duration_ms: Date.now() - started },
  })
  return { ok: true as const, counts }
}
