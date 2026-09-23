'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { AgentDebate } from '@/components/AgentDebate'
import { AuditLog } from '@/components/AuditLog'
import { AutonomySelector } from '@/components/AutonomySelector'
import { BiasPanel } from '@/components/BiasPanel'
import { DocumentsPanel } from '@/components/DocumentsPanel'
import { EditDialog } from '@/components/EditDialog'
import {
  ElementCard,
  type ElementCitation,
  type StudioElement,
} from '@/components/ElementCard'
import { ExplainPopover } from '@/components/ExplainPopover'
import { JourneyCanvas } from '@/components/JourneyCanvas'
import { PriorityMatrix } from '@/components/PriorityMatrix'
import { ProductCanvas } from '@/components/ProductCanvas'
import { RegenerateDialog } from '@/components/RegenerateDialog'
import {
  autoAccept,
  logSuggestionDismissed,
  logSuggestionUsed,
  undoAuto,
  type ActionCtx,
} from '@/lib/elementActions'
import { generateElements } from '@/lib/generate'
import { runPipeline } from '@/lib/pipeline'
import type { AgentOpinion } from '@/lib/debate'
import type { BiasReport } from '@/lib/bias'
import type { ElementKind } from '@/lib/schemas'
import { fetchSuggestions, type Suggestion } from '@/lib/suggest'
import { createClient } from '@/lib/supabase/client'

type SessionInfo = {
  id: string
  title: string | null
  brief: string | null
  mode: string | null
}

const COLUMNS: { type: ElementKind; title: string; action: string }[] = [
  { type: 'persona', title: 'Personas', action: 'Générer 3 personas' },
  { type: 'journey', title: 'Parcours', action: 'Générer 3 parcours' },
  { type: 'feature', title: 'Fonctionnalités', action: 'Générer 3 fonctionnalités' },
]

type NestedDocument = { filename?: string | null } | { filename?: string | null }[] | null

type NestedChunk = {
  content?: string | null
  page?: number | null
  documents?: NestedDocument
} | null

type NestedSource = {
  chunk_id?: string | null
  chunks?: NestedChunk
}

function filenameFrom(documents: NestedDocument): string | undefined {
  if (!documents) return undefined
  if (Array.isArray(documents)) return documents[0]?.filename ?? undefined
  return documents.filename ?? undefined
}

function mapLoadedElement(row: StudioElement & { element_sources?: NestedSource[] | null }): StudioElement {
  const sources = row.element_sources ?? []
  const citations: ElementCitation[] = sources.flatMap((source, index) => {
    const chunkId = source.chunk_id
    if (!chunkId) return []
    const chunk = source.chunks
    const excerpt = (chunk?.content ?? '').slice(0, 300)
    return [
      {
        ref: `S${index + 1}`,
        chunk_id: chunkId,
        filename: filenameFrom(chunk?.documents ?? null) ?? null,
        page: chunk?.page ?? null,
        excerpt,
      },
    ]
  })

  return { ...row, citations }
}

function asStudioElement(row: Record<string, unknown>, citations?: ElementCitation[]): StudioElement {
  return {
    id: String(row.id),
    type: String(row.type ?? ''),
    content: (row.content as Record<string, unknown> | null) ?? null,
    source: (row.source as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    confidence: typeof row.confidence === 'number' ? row.confidence : null,
    reasoning: (row.reasoning as string | null) ?? null,
    priority_impact: typeof row.priority_impact === 'number' ? row.priority_impact : null,
    priority_effort: typeof row.priority_effort === 'number' ? row.priority_effort : null,
    citations,
  }
}

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [brief, setBrief] = useState('')
  const [elements, setElements] = useState<StudioElement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [generating, setGenerating] = useState<Partial<Record<ElementKind, boolean>>>({})
  const [errors, setErrors] = useState<Partial<Record<ElementKind, string | null>>>({})
  const [invalidCounts, setInvalidCounts] = useState<Partial<Record<ElementKind, number>>>({})
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'err' } | null>(null)
  const [editState, setEditState] = useState<
    | { mode: 'create'; type: ElementKind; suggestion?: Suggestion }
    | { mode: 'edit'; element: StudioElement }
    | null
  >(null)
  const [regenElement, setRegenElement] = useState<StudioElement | null>(null)
  const [explainElement, setExplainElement] = useState<StudioElement | null>(null)
  const [canvasJourney, setCanvasJourney] = useState<StudioElement | null>(null)
  const [autoAcceptedIds, setAutoAcceptedIds] = useState<Set<string>>(new Set())
  const [auditKey, setAuditKey] = useState(0)
  const [suggestions, setSuggestions] = useState<Partial<Record<ElementKind, Suggestion[]>>>({})
  const [suggesting, setSuggesting] = useState<Partial<Record<ElementKind, boolean>>>({})
  const [suggestErrors, setSuggestErrors] = useState<Partial<Record<ElementKind, string | null>>>({})
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [pipelineBanner, setPipelineBanner] = useState<string | null>(null)
  const [opinionsByFeature, setOpinionsByFeature] = useState<Record<string, AgentOpinion[]>>({})
  const [biasReport, setBiasReport] = useState<BiasReport | null>(null)
  const [regenFeedback, setRegenFeedback] = useState<string | undefined>()

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      const supabase = createClient()

      const [
        { data: sessionData, error: sessionError },
        { data: elementData, error: elementError },
        { data: autoEvents },
      ] = await Promise.all([
        supabase.from('sessions').select('id, title, brief, mode').eq('id', id).single(),
        supabase
          .from('elements')
          .select('*, element_sources(chunk_id, chunks(content, page, documents(filename)))')
          .eq('session_id', id)
          .order('position', { ascending: true }),
        supabase
          .from('events')
          .select('element_id')
          .eq('session_id', id)
          .eq('event_type', 'card_auto_accepted'),
      ])

      if (cancelled) return

      if (sessionError || !sessionData) {
        setLoadError(sessionError?.message ?? 'Session introuvable.')
        setLoading(false)
        return
      }

      const row = sessionData as SessionInfo
      setSession(row)
      setBrief(row.brief ?? '')
      setElements(
        ((elementData as (StudioElement & { element_sources?: NestedSource[] | null })[] | null) ?? []).map(
          mapLoadedElement
        )
      )
      setAutoAcceptedIds(
        new Set(
          ((autoEvents as { element_id?: string | null }[] | null) ?? [])
            .map((item) => item.element_id)
            .filter((value): value is string => Boolean(value))
        )
      )
      if (elementError) setLoadError(elementError.message)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const grouped = useMemo(() => {
    return {
      persona: elements.filter((el) => el.type === 'persona'),
      journey: elements.filter((el) => el.type === 'journey'),
      feature: elements.filter((el) => el.type === 'feature'),
    }
  }, [elements])

  const featureIdsKey = useMemo(
    () =>
      elements
        .filter((el) => el.type === 'feature')
        .map((el) => el.id)
        .sort()
        .join(','),
    [elements]
  )

  useEffect(() => {
    const featureIds = featureIdsKey ? featureIdsKey.split(',') : []
    if (!featureIds.length) {
      setOpinionsByFeature({})
      return
    }

    let cancelled = false

    async function loadOpinions() {
      const supabase = createClient()
      const { data } = await supabase.from('agent_opinions').select('*').in('element_id', featureIds)
      if (cancelled) return
      const grouped: Record<string, AgentOpinion[]> = {}
      for (const row of (data as AgentOpinion[] | null) ?? []) {
        grouped[row.element_id] = [...(grouped[row.element_id] ?? []), row]
      }
      setOpinionsByFeature(grouped)
    }

    void loadOpinions()
    return () => {
      cancelled = true
    }
  }, [featureIdsKey])

  const ctx: ActionCtx = useMemo(
    () => ({
      sessionId: id,
      mode: session?.mode === 'draft' || session?.mode === 'act' ? session.mode : 'suggest',
    }),
    [id, session?.mode]
  )

  const busy =
    pipelineRunning ||
    Object.values(generating).some(Boolean) ||
    Object.values(suggesting).some(Boolean)

  function showToast(message: string, kind: 'ok' | 'err') {
    setToast({ message, kind })
  }

  function bumpAudit() {
    setAuditKey((value) => value + 1)
  }

  function mergeRow(row: Record<string, unknown>, citations?: ElementCitation[]) {
    const rowId = String(row.id)
    setElements((prev) => {
      const current = prev.find((item) => item.id === rowId)
      const next = asStudioElement(row, citations ?? current?.citations)
      if (!current) return [...prev, next]
      return prev.map((item) =>
        item.id === rowId ? { ...item, ...next, citations: citations ?? item.citations } : item
      )
    })
  }

  function markAutoAccepted(elementId: string) {
    setAutoAcceptedIds((prev) => {
      const next = new Set(prev)
      next.add(elementId)
      return next
    })
  }

  async function saveBrief() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    const supabase = createClient()
    const { error } = await supabase.from('sessions').update({ brief }).eq('id', id)
    if (error) {
      setSaveError(error.message)
    } else {
      setSession((prev) => (prev ? { ...prev, brief } : prev))
      setSaveOk(true)
    }
    setSaving(false)
  }

  async function generate(type: ElementKind) {
    setGenerating((prev) => ({ ...prev, [type]: true }))
    setErrors((prev) => ({ ...prev, [type]: null }))
    setInvalidCounts((prev) => ({ ...prev, [type]: 0 }))

    const pending: Promise<void>[] = []

    await generateElements({
      sessionId: id,
      type,
      count: 3,
      onElement: (el: StudioElement) => {
        if (ctx.mode !== 'act') {
          setElements((prev) => (prev.some((item) => item.id === el.id) ? prev : [...prev, el]))
          return
        }
        pending.push(
          (async () => {
            try {
              const row = await autoAccept(ctx, el.id)
              mergeRow({ ...(row as Record<string, unknown>) }, el.citations)
              markAutoAccepted(el.id)
            } catch {
              setElements((prev) => (prev.some((item) => item.id === el.id) ? prev : [...prev, el]))
            }
          })()
        )
      },
      onInvalid: () => {
        setInvalidCounts((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }))
      },
      onError: (message) => {
        setErrors((prev) => ({ ...prev, [type]: message }))
      },
    })

    await Promise.all(pending)
    bumpAudit()
    setGenerating((prev) => ({ ...prev, [type]: false }))
  }

  async function suggest(type: ElementKind) {
    setSuggesting((prev) => ({ ...prev, [type]: true }))
    setSuggestErrors((prev) => ({ ...prev, [type]: null }))
    try {
      const items = await fetchSuggestions(id, type, 4)
      setSuggestions((prev) => ({ ...prev, [type]: items }))
      bumpAudit()
    } catch (e) {
      setSuggestErrors((prev) => ({
        ...prev,
        [type]: e instanceof Error ? e.message : 'Suggestions impossibles',
      }))
    } finally {
      setSuggesting((prev) => ({ ...prev, [type]: false }))
    }
  }

  function removeSuggestion(type: ElementKind, label: string) {
    setSuggestions((prev) => ({
      ...prev,
      [type]: (prev[type] ?? []).filter((item) => item.label !== label),
    }))
  }

  async function startPipeline() {
    if (!brief.trim()) return
    if (
      elements.length > 0 &&
      !confirm('Des éléments existent déjà. De nouveaux seront ajoutés. Continuer ?')
    ) {
      return
    }
    setPipelineRunning(true)
    setPipelineError(null)
    setPipelineBanner(null)
    setPipelineStep('Étape 1/3 : Personas...')
    const result = await runPipeline(ctx, {
      onStep: (label, index, total) => {
        setPipelineStep(`Étape ${index + 1}/${total} : ${label}...`)
      },
      onElement: (el: StudioElement) => {
        mergeRow(el as unknown as Record<string, unknown>, el.citations)
        if (el.id && el.status === 'validated') markAutoAccepted(el.id)
      },
      onError: (message) => setPipelineError(message),
    })
    if (result.ok) {
      const n = Object.values(result.counts).reduce((sum, value) => sum + value, 0)
      setPipelineBanner(
        `Le pipeline a créé ${n} éléments sans validation humaine. Relis-les avant de les utiliser.`
      )
    }
    setPipelineRunning(false)
    setPipelineStep(null)
    bumpAudit()
  }

  async function undoAutoAccepted(elementId: string) {
    const row = await undoAuto(ctx, elementId)
    bumpAudit()
    return row
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        Chargement de la session…
      </main>
    )
  }

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 bg-zinc-50 px-6 py-16 text-zinc-900">
        <p className="text-sm text-red-600">{loadError ?? 'Session introuvable.'}</p>
        <Link href="/sessions" className="text-sm font-medium text-indigo-700 hover:text-indigo-800">
          Retour aux sessions
        </Link>
      </main>
    )
  }

  const suggestMode = ctx.mode === 'suggest'
  const actMode = ctx.mode === 'act'
  const briefEmpty = !brief.trim()

  return (
    <main className="min-h-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10">
        <header className="space-y-3">
          <Link href="/sessions" className="text-sm font-medium text-indigo-700 hover:text-indigo-800">
            ← Sessions
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {session.title?.trim() || `Session ${session.id.slice(0, 8)}`}
              </h1>
            </div>
            <AutonomySelector
              ctx={ctx}
              disabled={busy}
              onChanged={(mode) => {
                setSession((prev) => (prev ? { ...prev, mode } : prev))
                bumpAudit()
              }}
              onToast={showToast}
            />
          </div>
        </header>

        {actMode ? (
          <AuditLog
            sessionId={session.id}
            elements={elements}
            refreshKey={auditKey}
            autoAcceptedIds={autoAcceptedIds}
            onUndo={(elementId) => {
              void (async () => {
                try {
                  const row = await undoAutoAccepted(elementId)
                  mergeRow(row as Record<string, unknown>)
                  showToast('Élément annulé.', 'ok')
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Annulation impossible', 'err')
                }
              })()
            }}
          />
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <label htmlFor="brief" className="text-sm font-medium text-zinc-800">
            Brief produit
          </label>
          <textarea
            id="brief"
            value={brief}
            onChange={(event) => {
              setBrief(event.target.value)
              setSaveOk(false)
            }}
            rows={6}
            className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-900 outline-none ring-indigo-500 focus:bg-white focus:ring-2"
            placeholder="Décrivez le produit, le public visé et le problème à résoudre…"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveBrief}
              disabled={saving || busy}
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
            {saveOk ? <p className="text-sm text-green-700">Brief enregistré.</p> : null}
          </div>
        </section>

        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

        <details className="rounded-2xl border border-zinc-200 bg-white p-6">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
            Documents sources
          </summary>
          <div className="mt-5">
            <DocumentsPanel key={session.id} sessionId={session.id} />
          </div>
        </details>

        <details className="rounded-2xl border border-zinc-200 bg-white p-6">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Canvas produit</summary>
          <div className="mt-5">
            <ProductCanvas
              sessionId={session.id}
              brief={session.brief ?? brief}
              personas={grouped.persona.filter((item) => item.status === 'validated')}
              features={grouped.feature.filter((item) => item.status !== 'rejected')}
              risks={[]}
            />
          </div>
        </details>

        {actMode ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startPipeline()}
                disabled={busy || briefEmpty}
                className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Lancer le pipeline complet
              </button>
              {pipelineRunning ? (
                <span className="inline-flex items-center gap-2 text-sm text-zinc-600">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                  {pipelineStep ?? 'Pipeline en cours…'}
                </span>
              ) : null}
              {briefEmpty ? (
                <p className="text-sm text-zinc-500">Enregistre un brief pour lancer le pipeline.</p>
              ) : null}
            </div>
            {pipelineError ? <p className="mt-3 text-sm text-red-600">{pipelineError}</p> : null}
            {pipelineBanner ? (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
                <p>{pipelineBanner}</p>
                <button
                  type="button"
                  onClick={() => setPipelineBanner(null)}
                  className="shrink-0 text-xs font-medium text-violet-700 hover:text-violet-900"
                >
                  Fermer
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const isGenerating = Boolean(generating[column.type])
            const isSuggesting = Boolean(suggesting[column.type])
            const invalidCount = invalidCounts[column.type] ?? 0
            const error = errors[column.type]
            const suggestError = suggestErrors[column.type]
            const items = grouped[column.type]
            const chips = suggestions[column.type] ?? []

            return (
              <div key={column.type} className="flex flex-col gap-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{column.title}</h2>
                    <p className="text-xs text-zinc-500">
                      {items.length} élément{items.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {suggestMode ? (
                    <button
                      type="button"
                      onClick={() => void suggest(column.type)}
                      disabled={busy}
                      className="h-10 shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {isSuggesting ? 'Suggestion…' : 'Suggérer des pistes'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void generate(column.type)}
                      disabled={busy}
                      className="h-10 shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {isGenerating ? 'Génération…' : column.action}
                    </button>
                  )}
                </div>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {suggestError ? <p className="text-sm text-red-600">{suggestError}</p> : null}
                {invalidCount > 0 ? (
                  <p className="text-xs text-zinc-500">
                    {invalidCount} ligne{invalidCount > 1 ? 's' : ''} ignorée
                    {invalidCount > 1 ? 's' : ''}
                  </p>
                ) : null}

                {column.type === 'persona' ? (
                  <BiasPanel
                    sessionId={session.id}
                    ctx={ctx}
                    personaCount={grouped.persona.filter((item) => item.status !== 'rejected').length}
                    onReportChange={setBiasReport}
                    onRegenerate={(elementId, feedback) => {
                      const target = elements.find((item) => item.id === elementId)
                      if (!target) return
                      setRegenFeedback(feedback)
                      setRegenElement(target)
                    }}
                  />
                ) : null}

                {chips.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {chips.map((chip) => (
                      <div
                        key={chip.label}
                        className="flex items-start justify-between gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2"
                      >
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void logSuggestionUsed(ctx, { type: column.type, label: chip.label })
                            setEditState({ mode: 'create', type: column.type, suggestion: chip })
                            removeSuggestion(column.type, chip.label)
                            bumpAudit()
                          }}
                          className="min-w-0 text-left disabled:opacity-50"
                        >
                          <p className="text-sm font-medium text-violet-900">{chip.label}</p>
                          <p className="text-xs text-zinc-500">{chip.hint}</p>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void logSuggestionDismissed(ctx, { type: column.type, label: chip.label })
                            removeSuggestion(column.type, chip.label)
                            bumpAudit()
                          }}
                          className="shrink-0 text-xs font-medium text-zinc-400 hover:text-zinc-700 disabled:opacity-50"
                          aria-label="Retirer la piste"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-col gap-4">
                  {items.length === 0 && !isGenerating ? (
                    <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">
                      Aucun élément pour l’instant.
                    </p>
                  ) : null}
                  {items.map((element) => (
                    <div key={element.id} className="flex flex-col gap-3">
                      <ElementCard
                        element={element}
                        ctx={ctx}
                        locked={busy}
                        autoAccepted={autoAcceptedIds.has(element.id)}
                        onUpdated={(row) => {
                          mergeRow(row)
                          bumpAudit()
                        }}
                        onEdit={() => setEditState({ mode: 'edit', element })}
                        onRegenerate={() => {
                          setRegenFeedback(undefined)
                          setRegenElement(element)
                        }}
                        onExplain={() => setExplainElement(element)}
                        onToast={showToast}
                        onUndoAuto={() => undoAutoAccepted(element.id)}
                      />
                      {column.type === 'feature' && element.status !== 'rejected' ? (
                        <AgentDebate
                          element={element}
                          ctx={ctx}
                          opinions={opinionsByFeature[element.id] ?? []}
                          onOpinionsChange={(opinions) => {
                            setOpinionsByFeature((prev) => ({ ...prev, [element.id]: opinions }))
                          }}
                          onArbitrated={bumpAudit}
                        />
                      ) : null}
                      {column.type === 'journey' && element.status !== 'rejected' ? (
                        <button
                          type="button"
                          onClick={() => setCanvasJourney(element)}
                          className="h-9 self-start rounded-lg bg-zinc-100 px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-200"
                        >
                          Voir en canvas
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                {column.type === 'feature' ? (
                  <details className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                      Matrice impact / effort
                    </summary>
                    <div className="mt-4">
                      <PriorityMatrix
                        ctx={ctx}
                        features={grouped.feature}
                        onUpdated={(row) => {
                          mergeRow(row)
                          bumpAudit()
                        }}
                        onToast={showToast}
                      />
                    </div>
                  </details>
                ) : null}

                <button
                  type="button"
                  onClick={() => setEditState({ mode: 'create', type: column.type })}
                  disabled={busy}
                  className="h-10 rounded-lg border border-dashed border-zinc-300 text-sm font-medium text-zinc-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
                >
                  + Ajouter à la main
                </button>
              </div>
            )
          })}
        </section>
      </div>

      {editState ? (
        <EditDialog
          ctx={ctx}
          type={editState.mode === 'create' ? editState.type : (editState.element.type as ElementKind)}
          element={editState.mode === 'edit' ? editState.element : null}
          suggestion={editState.mode === 'create' ? editState.suggestion : undefined}
          onClose={() => setEditState(null)}
          onSaved={(row) => {
            mergeRow(row)
            bumpAudit()
          }}
          onToast={showToast}
        />
      ) : null}

      {regenElement ? (
        <RegenerateDialog
          key={`${regenElement.id}-${regenFeedback ?? ''}`}
          elementId={regenElement.id}
          initialFeedback={regenFeedback}
          onClose={() => {
            setRegenElement(null)
            setRegenFeedback(undefined)
          }}
          onDone={(row) => {
            mergeRow(row, row.citations)
            bumpAudit()
            showToast('Carte régénérée.', 'ok')
          }}
        />
      ) : null}

      {explainElement ? (
        <ExplainPopover
          ctx={ctx}
          element={elements.find((item) => item.id === explainElement.id) ?? explainElement}
          biasReport={biasReport}
          onClose={() => setExplainElement(null)}
        />
      ) : null}

      {canvasJourney ? (
        <JourneyCanvas
          journey={elements.find((item) => item.id === canvasJourney.id) ?? canvasJourney}
          onClose={() => setCanvasJourney(null)}
        />
      ) : null}

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${
            toast.kind === 'ok' ? 'bg-green-700 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </main>
  )
}
