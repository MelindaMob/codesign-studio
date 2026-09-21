'use client'

import { useState } from 'react'
import { setStatus, type ActionCtx } from '@/lib/elementActions'

export type ElementCitation = {
  ref: string
  chunk_id: string
  filename?: string | null
  page: number | null
  excerpt: string
}

export type StudioElement = {
  id: string
  type: string
  content: Record<string, unknown> | null
  source: string | null
  status: string | null
  confidence: number | null
  reasoning: string | null
  priority_impact: number | null
  priority_effort: number | null
  citations?: ElementCitation[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposé',
  validated: 'Validé',
  rejected: 'Rejeté',
  edited: 'Modifié',
}

const EMOTION_LABELS: Record<string, string> = {
  happy: 'Satisfait',
  neutral: 'Neutre',
  frustrated: 'Frustré',
}

function sourceLabel(source: string | null) {
  if (!source) return 'Inconnue'
  if (source === 'ai_generated') return 'IA'
  if (source.startsWith('human_')) return 'Humain'
  return source
}

function sourceClass(source: string | null) {
  if (source?.startsWith('human_')) {
    return 'bg-green-100 text-green-800'
  }
  return 'bg-violet-100 text-violet-800'
}

function PersonaBody({ content }: { content: Record<string, unknown> }) {
  const goals = asStringList(content.goals)
  const frustrations = asStringList(content.frustrations)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
          {asString(content.name) || 'Persona'}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          {asNumber(content.age) ? `${asNumber(content.age)} ans` : null}
          {asNumber(content.age) && asString(content.role) ? ' · ' : null}
          {asString(content.role)}
        </p>
      </div>
      {goals.length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Objectifs
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700">
            {goals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {frustrations.length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Frustrations
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700">
            {frustrations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {asString(content.quote) ? (
        <blockquote className="border-l-2 border-indigo-200 pl-3 text-sm text-zinc-600 italic">
          « {asString(content.quote)} »
        </blockquote>
      ) : null}
    </div>
  )
}

function JourneyBody({ content }: { content: Record<string, unknown> }) {
  const steps = Array.isArray(content.steps) ? content.steps : []

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
        {asString(content.title) || 'Parcours'}
      </h3>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const row = asRecord(step)
          const emotion = asString(row.emotion)
          return (
            <li key={`${asString(row.stage)}-${index}`} className="text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-900">
                    {index + 1}. {asString(row.stage) || 'Étape'}
                  </p>
                  <p className="mt-0.5 text-zinc-600">{asString(row.action)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {EMOTION_LABELS[emotion] ?? emotion}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FeatureBody({
  content,
  impact,
  effort,
}: {
  content: Record<string, unknown>
  impact: number | null
  effort: number | null
}) {
  const resolvedImpact = impact ?? asNumber(content.impact)
  const resolvedEffort = effort ?? asNumber(content.effort)

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
        {asString(content.title) || 'Fonctionnalité'}
      </h3>
      <p className="text-sm text-zinc-700">{asString(content.description)}</p>
      {asString(content.user_value) ? (
        <p className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">Valeur utilisateur : </span>
          {asString(content.user_value)}
        </p>
      ) : null}
      <div className="flex gap-4 text-sm text-zinc-600">
        {resolvedImpact != null ? <span>Impact {resolvedImpact}/5</span> : null}
        {resolvedEffort != null ? <span>Effort {resolvedEffort}/5</span> : null}
      </div>
    </div>
  )
}

export function ElementCard({
  element,
  ctx,
  onUpdated,
  onEdit,
  onRegenerate,
  onExplain,
  onToast,
  locked,
  autoAccepted,
  onUndoAuto,
}: {
  element: StudioElement
  ctx: ActionCtx
  onUpdated: (row: Record<string, unknown>) => void
  onEdit: () => void
  onRegenerate: () => void
  onExplain: () => void
  onToast: (message: string, kind: 'ok' | 'err') => void
  locked?: boolean
  autoAccepted?: boolean
  onUndoAuto?: () => Promise<unknown>
}) {
  const content = asRecord(element.content)
  const confidence = Math.round(Math.min(Math.max(element.confidence ?? 0, 0), 1) * 100)
  const status = element.status ?? 'proposed'
  const citations = element.citations ?? []
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const openCitation = citations.find((citation) => citation.ref === openRef)
  const rejected = status === 'rejected'
  const showRegen = ctx.mode !== 'suggest'
  const disabled = busy || Boolean(locked)
  const showAuto =
    Boolean(autoAccepted) && status === 'validated' && element.source === 'ai_generated'

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      const row = await action()
      if (row && typeof row === 'object') onUpdated(row as Record<string, unknown>)
      onToast(success, 'ok')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Action impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  function requestRegenerate() {
    if (element.source === 'human_edited') {
      if (!confirm('Régénérer écrasera les modifications humaines. Continuer ?')) return
    }
    onRegenerate()
  }

  const btn =
    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50'
  const primary = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`
  const secondary = `${btn} bg-zinc-100 text-zinc-800 hover:bg-zinc-200`
  const danger = `${btn} bg-red-50 text-red-700 hover:bg-red-100`

  return (
    <article
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${
        rejected ? 'opacity-60 [&_h3]:line-through' : ''
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sourceClass(element.source)}`}
        >
          {sourceLabel(element.source)}
        </span>
        {status ? (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            {STATUS_LABELS[status] ?? status}
          </span>
        ) : null}
        {showAuto ? (
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">
            Auto-validé par l’IA
          </span>
        ) : null}
      </div>

      {element.type === 'persona' ? (
        <PersonaBody content={content} />
      ) : element.type === 'journey' ? (
        <JourneyBody content={content} />
      ) : (
        <FeatureBody
          content={content}
          impact={element.priority_impact}
          effort={element.priority_effort}
        />
      )}

      <div className="mt-5 space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Confiance</span>
          <span>{confidence}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-indigo-500"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {element.reasoning ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-indigo-700">
            Raisonnement
          </summary>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{element.reasoning}</p>
        </details>
      ) : null}

      <div className="mt-4">
        {citations.length === 0 ? (
          <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
            Hypothèse (sans source)
          </span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {citations.map((citation) => {
              const label = citation.page
                ? `${citation.filename ?? 'document'}, p.${citation.page}`
                : (citation.filename ?? 'document')
              const isOpen = openRef === citation.ref
              return (
                <button
                  key={`${citation.ref}-${citation.chunk_id}`}
                  type="button"
                  onClick={() => setOpenRef(isOpen ? null : citation.ref)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    isOpen
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
        {openCitation?.excerpt ? (
          <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600">
            {openCitation.excerpt}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
        {rejected ? (
          <button
            type="button"
            disabled={disabled}
            className={primary}
            onClick={() => void run(() => setStatus(ctx, element.id, 'proposed'), 'Carte restaurée.')}
          >
            Restaurer
          </button>
        ) : status === 'validated' ? (
          <>
            <button type="button" disabled={disabled} className={secondary} onClick={onEdit}>
              Modifier
            </button>
            {showRegen ? (
              <button type="button" disabled={disabled} className={secondary} onClick={requestRegenerate}>
                Régénérer
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              className={secondary}
              onClick={() =>
                void run(() => setStatus(ctx, element.id, 'proposed'), 'Validation annulée.')
              }
            >
              Annuler la validation
            </button>
            {showAuto && onUndoAuto ? (
              <button
                type="button"
                disabled={disabled}
                className={danger}
                onClick={() => void run(() => onUndoAuto(), 'Élément annulé.')}
              >
                Annuler
              </button>
            ) : null}
            <button type="button" disabled={disabled} className={secondary} onClick={onExplain}>
              Pourquoi ça ?
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={disabled}
              className={primary}
              onClick={() => void run(() => setStatus(ctx, element.id, 'validated'), 'Carte acceptée.')}
            >
              Accepter
            </button>
            <button type="button" disabled={disabled} className={secondary} onClick={onEdit}>
              Modifier
            </button>
            {showRegen ? (
              <button type="button" disabled={disabled} className={secondary} onClick={requestRegenerate}>
                Régénérer
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              className={danger}
              onClick={() => void run(() => setStatus(ctx, element.id, 'rejected'), 'Carte rejetée.')}
            >
              Rejeter
            </button>
            <button type="button" disabled={disabled} className={secondary} onClick={onExplain}>
              Pourquoi ça ?
            </button>
          </>
        )}
      </div>
    </article>
  )
}
