'use client'

import { useState } from 'react'
import type { StudioElement } from '@/components/ElementCard'
import { logArbitration, type ActionCtx } from '@/lib/elementActions'
import { runDebate, type AgentOpinion, type AgentRole, type Stance } from '@/lib/debate'

const ROLE_META: Record<AgentRole, { label: string; initials: string }> = {
  ux_researcher: { label: 'UX Researcher', initials: 'UX' },
  product_manager: { label: 'Product Manager', initials: 'PM' },
  tech_lead: { label: 'Tech Lead', initials: 'TL' },
}

const STANCE_META: Record<Stance, { label: string; className: string }> = {
    agree: { label: 'D’accord', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
    concern: { label: 'Réserve', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
    alternative: { label: 'Alternative', className: 'bg-violet-50 text-violet-900 ring-1 ring-violet-300' },
}

function isRole(value: string): value is AgentRole {
  return value === 'ux_researcher' || value === 'product_manager' || value === 'tech_lead'
}

function isStance(value: string): value is Stance {
  return value === 'agree' || value === 'concern' || value === 'alternative'
}

export function AgentDebate({
  element,
  ctx,
  opinions,
  onOpinionsChange,
  onArbitrated,
}: {
  element: StudioElement
  ctx: ActionCtx
  opinions: AgentOpinion[]
  onOpinionsChange: (opinions: AgentOpinion[]) => void
  onArbitrated?: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partialErrors, setPartialErrors] = useState<string[]>([])
  const [ownNote, setOwnNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [deciding, setDeciding] = useState(false)

  if (element.type !== 'feature') return null

  async function debate() {
    setPending(true)
    setError(null)
    setPartialErrors([])
    setSaved(false)
    try {
      const result = await runDebate(element.id)
      onOpinionsChange(result.opinions)
      if (result.partial) setPartialErrors(result.errors)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Débat impossible')
    } finally {
      setPending(false)
    }
  }

  async function relaunch() {
    if (!confirm('Relancer le débat remplacera les avis actuels. Continuer ?')) return
    await debate()
  }

  async function decide(followed: AgentRole | 'own', note?: string) {
    setDeciding(true)
    setError(null)
    try {
      await logArbitration(ctx, element.id, { followed, note })
      setSaved(true)
      onArbitrated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Décision impossible')
    } finally {
      setDeciding(false)
    }
  }

  const hasOpinions = opinions.length > 0

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">Débat des agents</p>
        {hasOpinions && !pending ? (
          <button
            type="button"
            onClick={() => void relaunch()}
            className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            Relancer le débat
          </button>
        ) : null}
      </div>

      {!hasOpinions ? (
        <button
          type="button"
          onClick={() => void debate()}
          disabled={pending}
          className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? 'Les agents réfléchissent…' : 'Faire réagir les agents'}
        </button>
      ) : null}

      {pending && hasOpinions ? (
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          Nouveau débat en cours…
        </div>
      ) : null}

      {pending && !hasOpinions ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          Les trois agents réagissent (10–20 s)…
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {partialErrors.length > 0 ? (
        <p className="mt-3 text-xs text-amber-700">
          Certains agents n’ont pas répondu : {partialErrors.join(', ')}
        </p>
      ) : null}

      {hasOpinions ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {opinions.map((opinion) => {
              const role = isRole(opinion.agent_role) ? opinion.agent_role : 'ux_researcher'
              const stance = isStance(opinion.stance) ? opinion.stance : 'concern'
              const meta = ROLE_META[role]
              const stanceMeta = STANCE_META[stance]
              return (
                <article key={opinion.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-800">
                      {meta.initials}
                    </span>
                    <p className="text-xs font-semibold text-zinc-800">{meta.label}</p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${stanceMeta.className}`}
                  >
                    {stanceMeta.label}
                  </span>
                  <p className="mt-2 text-xs leading-5 text-zinc-600">{opinion.comment}</p>
                </article>
              )
            })}
          </div>

          <div className="mt-4 space-y-3 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium text-zinc-500">Ta décision</p>
            <div className="flex flex-wrap gap-2">
              {opinions.map((opinion) => {
                const role = isRole(opinion.agent_role) ? opinion.agent_role : null
                if (!role) return null
                return (
                  <button
                    key={`follow-${opinion.id}`}
                    type="button"
                    disabled={deciding || pending}
                    onClick={() => void decide(role, opinion.comment)}
                    className="h-9 rounded-lg bg-zinc-100 px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-200 disabled:opacity-50"
                  >
                    Suivre {ROLE_META[role].label}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={ownNote}
                onChange={(event) => setOwnNote(event.target.value)}
                placeholder="Écrire ma propre décision"
                disabled={deciding || pending}
                className="h-10 flex-1 rounded-lg border border-zinc-200 px-3 text-sm outline-none ring-indigo-500 focus:ring-2 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={deciding || pending || !ownNote.trim()}
                onClick={() => void decide('own', ownNote.trim())}
                className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Valider
              </button>
            </div>
            {saved ? <p className="text-xs font-medium text-emerald-700">Décision enregistrée</p> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
