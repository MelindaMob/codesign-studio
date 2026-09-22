'use client'

import { useEffect, useState } from 'react'
import type { ElementCitation, StudioElement } from '@/components/ElementCard'
import { logExplainOpened, type ActionCtx } from '@/lib/elementActions'
import type { BiasReport } from '@/lib/bias'

const SEVERITY: Record<string, { label: string; className: string }> = {
  low: { label: 'Faible', className: 'bg-zinc-100 text-zinc-600' },
  medium: { label: 'Moyen', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  high: { label: 'Élevé', className: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

type ExplainPopoverProps = {
  ctx: ActionCtx
  element: StudioElement
  biasReport?: BiasReport | null
  onClose: () => void
}

export function ExplainPopover({ ctx, element, biasReport, onClose }: ExplainPopoverProps) {
  const [openRef, setOpenRef] = useState<string | null>(null)
  const citations = element.citations ?? []
  const openCitation = citations.find((citation) => citation.ref === openRef)
  const confidence = Math.round(Math.min(Math.max(element.confidence ?? 0, 0), 1) * 100)

  useEffect(() => {
    void logExplainOpened(ctx, element.id)
  }, [ctx, element.id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Pourquoi ça ?</h2>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900">
            Fermer
          </button>
        </div>

        <p className="text-sm leading-6 text-zinc-700">
          {element.reasoning || 'Aucun raisonnement disponible.'}
        </p>

        <div className="mt-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Confiance</span>
            <span>{confidence}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${confidence}%` }} />
          </div>
        </div>

        <div className="mt-5">
          {citations.length === 0 ? (
            <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
              Hypothèse (sans source)
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {citations.map((citation: ElementCitation) => {
                const label = citation.page
                  ? `${citation.filename ?? 'document'}, p.${citation.page}`
                  : (citation.filename ?? 'document')
                const isOpen = openRef === citation.ref
                return (
                  <button
                    key={`${citation.ref}-${citation.chunk_id}`}
                    type="button"
                    onClick={() => setOpenRef(isOpen ? null : citation.ref)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      isOpen ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-800'
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

        {element.type === 'persona' ? (
          <BiasNote element={element} biasReport={biasReport} />
        ) : null}
      </div>
    </div>
  )
}

function BiasNote({ element, biasReport }: { element: StudioElement; biasReport?: BiasReport | null }) {
  const name =
    element.content && typeof element.content === 'object' && typeof element.content.name === 'string'
      ? element.content.name
      : ''
  const flags = (biasReport?.flags?.items ?? []).filter((flag) => flag.persona_name === name)

  if (!biasReport) {
    return <p className="mt-6 text-sm text-zinc-400">Analyse des biais disponible pour les personas</p>
  }

  if (flags.length === 0) {
    return <p className="mt-6 text-sm text-emerald-700">Aucun biais détecté lors de la dernière analyse</p>
  }

  return (
    <div className="mt-6 space-y-2">
      {flags.map((flag, index) => {
        const severity = SEVERITY[flag.severity] ?? SEVERITY.medium
        return (
          <div key={`${flag.issue}-${index}`} className="rounded-xl bg-zinc-50 px-3 py-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${severity.className}`}>
              {severity.label}
            </span>
            <p className="mt-1 text-sm leading-6 text-zinc-700">{flag.issue}</p>
          </div>
        )
      })}
    </div>
  )
}
