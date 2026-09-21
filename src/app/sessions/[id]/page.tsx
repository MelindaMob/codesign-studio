'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { ElementCard, type StudioElement } from '@/components/ElementCard'
import { generateElements } from '@/lib/generate'
import type { ElementKind } from '@/lib/schemas'
import { createClient } from '@/lib/supabase/client'

type SessionInfo = {
  id: string
  title: string | null
  brief: string | null
  mode: string | null
}

const COLUMNS: { type: ElementKind; title: string; action: string }[] = [
  { type: 'persona', title: 'Personas', action: 'Générer 3 personas' },
  { type: 'journey', title: 'Journeys', action: 'Générer 3 journeys' },
  { type: 'feature', title: 'Features', action: 'Générer 3 features' },
]

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

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      const supabase = createClient()

      const [{ data: sessionData, error: sessionError }, { data: elementData, error: elementError }] =
        await Promise.all([
          supabase
            .from('sessions')
            .select('id, title, brief, mode')
            .eq('id', id)
            .single(),
          supabase
            .from('elements')
            .select(
              'id, type, content, source, status, confidence, reasoning, priority_impact, priority_effort, position'
            )
            .eq('session_id', id)
            .order('position', { ascending: true }),
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
      setElements((elementData as StudioElement[] | null) ?? [])
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

    await generateElements({
      sessionId: id,
      type,
      count: 3,
      onElement: (el: StudioElement) => {
        setElements((prev) => (prev.some((item) => item.id === el.id) ? prev : [...prev, el]))
      },
      onInvalid: () => {
        setInvalidCounts((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }))
      },
      onError: (message) => {
        setErrors((prev) => ({ ...prev, [type]: message }))
      },
    })

    setGenerating((prev) => ({ ...prev, [type]: false }))
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

  return (
    <main className="min-h-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10">
        <header className="space-y-3">
          <Link
            href="/sessions"
            className="text-sm font-medium text-indigo-700 hover:text-indigo-800"
          >
            ← Sessions
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {session.title?.trim() || `Session ${session.id.slice(0, 8)}`}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Mode {session.mode ?? 'suggest'}
              </p>
            </div>
          </div>
        </header>

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
              disabled={saving}
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
            {saveOk ? <p className="text-sm text-green-700">Brief enregistré.</p> : null}
          </div>
        </section>

        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const isGenerating = Boolean(generating[column.type])
            const invalidCount = invalidCounts[column.type] ?? 0
            const error = errors[column.type]
            const items = grouped[column.type]

            return (
              <div key={column.type} className="flex flex-col gap-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{column.title}</h2>
                    <p className="text-xs text-zinc-500">{items.length} élément{items.length > 1 ? 's' : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generate(column.type)}
                    disabled={isGenerating}
                    className="h-10 shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {isGenerating ? 'Génération…' : column.action}
                  </button>
                </div>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {invalidCount > 0 ? (
                  <p className="text-xs text-zinc-500">
                    {invalidCount} ligne{invalidCount > 1 ? 's' : ''} ignorée
                    {invalidCount > 1 ? 's' : ''}
                  </p>
                ) : null}

                <div className="flex flex-col gap-4">
                  {items.length === 0 && !isGenerating ? (
                    <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">
                      Aucun élément pour l’instant.
                    </p>
                  ) : null}
                  {items.map((element) => (
                    <ElementCard key={element.id} element={element} />
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </main>
  )
}
