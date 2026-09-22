'use client'

import { useState } from 'react'
import { logBiasAlertActed, type ActionCtx } from '@/lib/elementActions'
import { runBiasCheck, type BiasFlag, type BiasReport } from '@/lib/bias'

const SEVERITY: Record<BiasFlag['severity'], { label: string; className: string }> = {
  low: { label: 'Faible', className: 'bg-zinc-100 text-zinc-600' },
  medium: { label: 'Moyen', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  high: { label: 'Élevé', className: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

function scoreTone(score: number) {
  if (score < 0.4) return { bar: 'bg-red-500', badge: 'bg-red-50 text-red-700' }
  if (score <= 0.7) return { bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800' }
  return { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800' }
}

function itemsOf(report: BiasReport): BiasFlag[] {
  return Array.isArray(report.flags?.items) ? report.flags.items : []
}

export function BiasPanel({
  sessionId,
  ctx,
  personaCount,
  onReportChange,
  onRegenerate,
}: {
  sessionId: string
  ctx: ActionCtx
  personaCount: number
  onReportChange: (report: BiasReport | null) => void
  onRegenerate: (elementId: string, feedback?: string) => void
}) {
  const [report, setReport] = useState<BiasReport | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tooFew = personaCount < 2

  function commit(next: BiasReport | null) {
    setReport(next)
    onReportChange(next)
  }

  async function analyze() {
    if (tooFew) return
    setPending(true)
    setError(null)
    try {
      const next = await runBiasCheck(sessionId)
      commit(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse impossible')
    } finally {
      setPending(false)
    }
  }

  async function regenerate(flag: BiasFlag) {
    if (flag.element_id) onRegenerate(flag.element_id, flag.issue)
    await logBiasAlertActed(ctx, flag.element_id, {
      action: 'regenerate',
      issue: flag.issue,
      report_id: report?.id ?? '',
    })
  }

  async function dismiss(flag: BiasFlag, index: number) {
    if (report) {
      commit({
        ...report,
        flags: { ...report.flags, items: itemsOf(report).filter((_, i) => i !== index) },
      })
    }
    await logBiasAlertActed(ctx, flag.element_id, {
      action: 'dismiss',
      issue: flag.issue,
      report_id: report?.id ?? '',
    })
  }

  const flags = report ? itemsOf(report) : []
  const percent = report ? Math.round(Math.min(Math.max(report.diversity_score, 0), 1) * 100) : 0
  const tone = report ? scoreTone(report.diversity_score) : null
  const summary = report?.flags?.summary ?? ''

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">Analyse des biais</p>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={tooFew || pending}
            title={tooFew ? 'Il faut au moins 2 personas' : undefined}
            className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? 'Analyse…' : 'Analyser les biais'}
          </button>
          {tooFew ? <p className="text-[11px] text-zinc-400">Il faut au moins 2 personas</p> : null}
        </div>
      </div>

      {pending ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          Analyse en cours (5–15 s)…
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {report && tone ? (
        <div className="mt-4 space-y-3">
          <div className={`rounded-xl px-4 py-3 ${tone.badge}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Score de diversité</span>
              <span className="text-sm font-semibold">{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
              <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-sm leading-6">{summary}</p>
          </div>

          {flags.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{summary}</p>
          ) : (
            <ul className="space-y-3">
              {flags.map((flag, index) => {
                const severity = SEVERITY[flag.severity] ?? SEVERITY.medium
                return (
                  <li key={`${flag.persona_name}-${index}`} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900">{flag.persona_name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severity.className}`}>
                        {severity.label}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-zinc-600">{flag.issue}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!flag.element_id}
                        onClick={() => void regenerate(flag)}
                        className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        Régénérer ce persona
                      </button>
                      <button
                        type="button"
                        onClick={() => void dismiss(flag, index)}
                        className="h-8 rounded-lg bg-zinc-100 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                      >
                        Ignorer
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
