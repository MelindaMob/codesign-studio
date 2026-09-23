'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import type { StudioElement } from '@/components/ElementCard'

const KPIS = [
  'Taux d’adoption',
  'Temps gagné par session',
  'Score de confiance moyen',
  'Taux de validation humaine',
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function ProductCanvas({
  sessionId,
  brief,
  personas,
  features,
  risks = [],
}: {
  sessionId: string
  brief: string
  personas: StudioElement[]
  features: StudioElement[]
  risks?: string[]
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const targets = personas.slice(0, 3)
  const sortedFeatures = [...features].sort((a, b) => (b.priority_impact ?? 0) - (a.priority_impact ?? 0))
  const pool = [...personas, ...features]
  const validatedPct = pool.length
    ? Math.round((pool.filter((item) => item.status === 'validated').length / pool.length) * 100)
    : 0
  const aiPct = pool.length
    ? Math.round((pool.filter((item) => item.source === 'ai_generated').length / pool.length) * 100)
    : 0

  async function exportPng() {
    if (!canvasRef.current) return
    setExporting('png')
    setError(null)
    try {
      const dataUrl = await toPng(canvasRef.current, { pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = 'canvas-produit.png'
      link.href = dataUrl
      link.click()
    } catch {
      setError('Export PNG impossible.')
    } finally {
      setExporting(null)
    }
  }

  function exportPdf() {
    setExporting('pdf')
    setError(null)
    try {
      window.print()
    } catch {
      setError('Export PDF impossible.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #product-canvas, #product-canvas * { visibility: visible; }
          #product-canvas { position: absolute; top: 0; left: 0; }
        }
      `}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void exportPng()}
          disabled={Boolean(exporting)}
          className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {exporting === 'png' ? 'Export…' : 'Exporter en PNG'}
        </button>
        <button
          type="button"
          onClick={exportPdf}
          disabled={Boolean(exporting)}
          className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
        >
          {exporting === 'pdf' ? 'Export…' : 'Exporter en PDF'}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <div
        id="product-canvas"
        ref={canvasRef}
        className="mx-auto max-w-[800px] border border-zinc-300 bg-white px-10 py-12 text-zinc-900"
      >
        <p className="text-xs tracking-widest text-zinc-400 uppercase">CoDesign Studio · {sessionId.slice(0, 8)}</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Canvas produit</h2>

        <section className="mt-8">
          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Problème</h3>
          <p className="mt-2 text-sm leading-7 text-zinc-800">
            {brief.trim() || 'Aucun brief renseigné.'}
          </p>
        </section>

        <section className="mt-8">
          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Cibles</h3>
          {targets.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Aucun persona validé.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {targets.map((persona) => {
                const content = asRecord(persona.content)
                const name = typeof content.name === 'string' ? content.name : 'Persona'
                const role = typeof content.role === 'string' ? content.role : ''
                return (
                  <div
                    key={persona.id}
                    className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-white">
                      {initials(name) || 'P'}
                    </span>
                    <span className="text-sm text-zinc-800">
                      {name}
                      {role ? <span className="text-zinc-500"> · {role}</span> : null}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Fonctionnalités clés</h3>
          {sortedFeatures.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Aucune fonctionnalité.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {sortedFeatures.map((feature) => {
                const content = asRecord(feature.content)
                const title = typeof content.title === 'string' ? content.title : 'Fonctionnalité'
                const description = typeof content.description === 'string' ? content.description : ''
                return (
                  <li key={feature.id} className="border-b border-zinc-100 pb-3 last:border-0">
                    <p className="text-sm font-medium text-zinc-900">{title}</p>
                    {description ? <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p> : null}
                    <p className="mt-1 text-xs text-zinc-400">
                      Impact {feature.priority_impact ?? '—'} · Effort {feature.priority_effort ?? '—'}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">KPIs</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {KPIS.map((kpi) => (
              <li key={kpi} className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                {kpi}
              </li>
            ))}
          </ul>
        </section>

        {risks.length > 0 ? (
          <section className="mt-8">
            <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Risques</h3>
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
              {risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
          {validatedPct}% validé par des humains, {aiPct}% généré par l’IA
        </p>
      </div>
    </div>
  )
}
