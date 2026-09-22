'use client'

import { changeMode, type ActionCtx } from '@/lib/elementActions'

export const MODE_LABELS: Record<ActionCtx['mode'], string> = {
  suggest: 'Suggère',
  draft: 'Rédige',
  act: 'Agit seule',
}

const OPTIONS: { value: ActionCtx['mode']; label: string }[] = [
  { value: 'suggest', label: MODE_LABELS.suggest },
  { value: 'draft', label: MODE_LABELS.draft },
  { value: 'act', label: MODE_LABELS.act },
]

const DESCRIPTIONS: Record<ActionCtx['mode'], string> = {
  suggest: "L'IA propose des pistes, tu rédiges tout.",
  draft: "L'IA rédige, tu valides chaque élément.",
  act: "L'IA enchaîne toute seule, tu audites après.",
}

export function AutonomySelector({
  ctx,
  disabled,
  onChanged,
  onToast,
}: {
  ctx: ActionCtx
  disabled?: boolean
  onChanged: (mode: ActionCtx['mode']) => void
  onToast: (message: string, kind: 'ok' | 'err') => void
}) {
  async function select(newMode: ActionCtx['mode']) {
    if (newMode === ctx.mode) return
    if (
      newMode === 'act' &&
      !confirm(
        "En mode Agit seule, l'IA valide elle-même ses éléments. Tu pourras les annuler après coup."
      )
    ) {
      return
    }
    try {
      await changeMode(ctx, newMode)
      onChanged(newMode)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Changement de mode impossible', 'err')
    }
  }

  return (
    <div className="max-w-md">
      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1">
        {OPTIONS.map((option) => {
          const active = ctx.mode === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => void select(option.value)}
              className={`h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                active ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-zinc-500">{DESCRIPTIONS[ctx.mode]}</p>
    </div>
  )
}

export function ModeLabel({ mode }: { mode: string }) {
  const label =
    mode === 'suggest' || mode === 'draft' || mode === 'act' ? MODE_LABELS[mode] : mode
  return <>{label}</>
}
