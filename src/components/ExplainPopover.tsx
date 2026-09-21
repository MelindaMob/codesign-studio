'use client'

import { useEffect, useState } from 'react'
import type { ElementCitation, StudioElement } from '@/components/ElementCard'
import { logExplainOpened, type ActionCtx } from '@/lib/elementActions'

type ExplainPopoverProps = {
  ctx: ActionCtx
  element: StudioElement
  onClose: () => void
}

export function ExplainPopover({ ctx, element, onClose }: ExplainPopoverProps) {
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

        <p className="mt-6 text-sm text-zinc-400">Analyse des biais : bientôt disponible</p>
      </div>
    </div>
  )
}
