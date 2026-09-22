'use client'

import { useEffect, useState } from 'react'
import type { ElementCitation } from '@/components/ElementCard'

type RegenerateDialogProps = {
  elementId: string
  initialFeedback?: string
  onClose: () => void
  onDone: (element: Record<string, unknown> & { citations?: ElementCitation[] }) => void
}

export function RegenerateDialog({ elementId, initialFeedback, onClose, onDone }: RegenerateDialogProps) {
  const [feedback, setFeedback] = useState(initialFeedback ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, feedback: feedback.trim() || undefined }),
      })
      const payload = (await res.json()) as {
        element?: Record<string, unknown> & { citations?: ElementCitation[] }
        error?: string
      }
      if (!res.ok || !payload.element) {
        setError(payload.error ?? 'Régénération impossible.')
        setPending(false)
        return
      }
      onDone(payload.element)
      onClose()
    } catch {
      setError('Régénération impossible.')
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold tracking-tight">Régénérer</h2>
        <label className="mt-4 block text-sm font-medium text-zinc-800">
          Un retour pour l’IA ? (ex : plus jeune, moins technique)
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            disabled={pending}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2 disabled:opacity-60"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {pending ? (
          <div className="mt-4 flex items-center gap-3 text-sm text-zinc-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            Régénération en cours…
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className="h-10 px-3 text-sm text-zinc-600 disabled:opacity-50">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending}
            className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Régénérer
          </button>
        </div>
      </div>
    </div>
  )
}
