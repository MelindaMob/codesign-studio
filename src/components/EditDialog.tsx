'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createElement, editElement, type ActionCtx } from '@/lib/elementActions'
import type { StudioElement } from '@/components/ElementCard'
import type { ElementKind } from '@/lib/schemas'

type StepDraft = {
  stage: string
  action: string
  emotion: 'happy' | 'neutral' | 'frustrated'
  pain_point: string
  opportunity: string
}

type PersonaDraft = {
  name: string
  age: string
  role: string
  context: string
  goals: string[]
  frustrations: string[]
  quote: string
  ai_trust_level: number
  preferred_autonomy: 'suggest' | 'draft' | 'act'
}

type JourneyDraft = {
  title: string
  persona_name: string
  steps: StepDraft[]
}

type FeatureDraft = {
  title: string
  description: string
  user_value: string
  impact: number
  effort: number
}

type EditDialogProps = {
  ctx: ActionCtx
  type: ElementKind
  element?: StudioElement | null
  suggestion?: { label: string; hint: string } | null
  onClose: () => void
  onSaved: (row: Record<string, unknown>) => void
  onToast: (message: string, kind: 'ok' | 'err') => void
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function emptyStep(): StepDraft {
  return { stage: '', action: '', emotion: 'neutral', pain_point: '', opportunity: '' }
}

function personaFrom(element?: StudioElement | null): PersonaDraft {
  const content = asRecord(element?.content)
  const goals = Array.isArray(content.goals)
    ? content.goals.filter((g): g is string => typeof g === 'string')
    : []
  const frustrations = Array.isArray(content.frustrations)
    ? content.frustrations.filter((g): g is string => typeof g === 'string')
    : []
  return {
    name: typeof content.name === 'string' ? content.name : '',
    age: typeof content.age === 'number' ? String(content.age) : '',
    role: typeof content.role === 'string' ? content.role : '',
    context: typeof content.context === 'string' ? content.context : '',
    goals: goals.length ? goals : [''],
    frustrations: frustrations.length ? frustrations : [''],
    quote: typeof content.quote === 'string' ? content.quote : '',
    ai_trust_level: typeof content.ai_trust_level === 'number' ? content.ai_trust_level : 3,
    preferred_autonomy:
      content.preferred_autonomy === 'draft' || content.preferred_autonomy === 'act'
        ? content.preferred_autonomy
        : 'suggest',
  }
}

function journeyFrom(element?: StudioElement | null): JourneyDraft {
  const content = asRecord(element?.content)
  const rawSteps = Array.isArray(content.steps) ? content.steps : []
  const steps: StepDraft[] = rawSteps.map((step) => {
    const row = asRecord(step)
    return {
      stage: typeof row.stage === 'string' ? row.stage : '',
      action: typeof row.action === 'string' ? row.action : '',
      emotion:
        row.emotion === 'happy' || row.emotion === 'frustrated' ? row.emotion : 'neutral',
      pain_point: typeof row.pain_point === 'string' ? row.pain_point : '',
      opportunity: typeof row.opportunity === 'string' ? row.opportunity : '',
    }
  })
  while (steps.length < 4) steps.push(emptyStep())
  return {
    title: typeof content.title === 'string' ? content.title : '',
    persona_name: typeof content.persona_name === 'string' ? content.persona_name : '',
    steps,
  }
}

function featureFrom(element?: StudioElement | null): FeatureDraft {
  const content = asRecord(element?.content)
  return {
    title: typeof content.title === 'string' ? content.title : '',
    description: typeof content.description === 'string' ? content.description : '',
    user_value: typeof content.user_value === 'string' ? content.user_value : '',
    impact: element?.priority_impact ?? 3,
    effort: element?.priority_effort ?? 3,
  }
}

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-indigo-500 focus:ring-2'
const labelClass = 'text-sm font-medium text-zinc-800'

export function EditDialog({ ctx, type, element, suggestion, onClose, onSaved, onToast }: EditDialogProps) {
  const isCreate = !element
  const [persona, setPersona] = useState(() => personaFrom(element))
  const [journey, setJourney] = useState(() => journeyFrom(element))
  const [feature, setFeature] = useState(() => featureFrom(element))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function validate(): { content: Record<string, unknown>; columns?: { priority_impact: number; priority_effort: number } } | null {
    const nextErrors: Record<string, string> = {}

    if (type === 'persona') {
      if (!persona.name.trim()) nextErrors.name = 'Obligatoire'
      if (!persona.role.trim()) nextErrors.role = 'Obligatoire'
      if (!persona.context.trim()) nextErrors.context = 'Obligatoire'
      if (!persona.quote.trim()) nextErrors.quote = 'Obligatoire'
      const age = Number(persona.age)
      if (!Number.isInteger(age) || age < 15 || age > 95) nextErrors.age = 'Âge entre 15 et 95'
      const goals = persona.goals.map((g) => g.trim()).filter(Boolean)
      const frustrations = persona.frustrations.map((g) => g.trim()).filter(Boolean)
      if (goals.some((_, i) => !persona.goals[i]?.trim()) && persona.goals.some((g) => !g.trim())) {
        persona.goals.forEach((g, i) => {
          if (!g.trim()) nextErrors[`goals.${i}`] = 'Obligatoire'
        })
      }
      persona.frustrations.forEach((g, i) => {
        if (!g.trim()) nextErrors[`frustrations.${i}`] = 'Obligatoire'
      })
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors)
        return null
      }
      setErrors({})
      return {
        content: {
          name: persona.name.trim(),
          age,
          role: persona.role.trim(),
          context: persona.context.trim(),
          goals,
          frustrations,
          quote: persona.quote.trim(),
          ai_trust_level: persona.ai_trust_level,
          preferred_autonomy: persona.preferred_autonomy,
        },
      }
    }

    if (type === 'journey') {
      if (!journey.title.trim()) nextErrors.title = 'Obligatoire'
      if (!journey.persona_name.trim()) nextErrors.persona_name = 'Obligatoire'
      if (journey.steps.length < 4) nextErrors.steps = 'Au moins 4 étapes'
      if (journey.steps.length > 8) nextErrors.steps = '8 étapes maximum'
      journey.steps.forEach((step, i) => {
        if (!step.stage.trim()) nextErrors[`steps.${i}.stage`] = 'Obligatoire'
        if (!step.action.trim()) nextErrors[`steps.${i}.action`] = 'Obligatoire'
      })
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors)
        return null
      }
      setErrors({})
      return {
        content: {
          title: journey.title.trim(),
          persona_name: journey.persona_name.trim(),
          steps: journey.steps.map((step) => ({
            stage: step.stage.trim(),
            action: step.action.trim(),
            emotion: step.emotion,
            pain_point: step.pain_point.trim() || null,
            opportunity: step.opportunity.trim() || null,
          })),
        },
      }
    }

    if (!feature.title.trim()) nextErrors.title = 'Obligatoire'
    if (!feature.description.trim()) nextErrors.description = 'Obligatoire'
    if (!feature.user_value.trim()) nextErrors.user_value = 'Obligatoire'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return null
    }
    setErrors({})
    return {
      content: {
        title: feature.title.trim(),
        description: feature.description.trim(),
        user_value: feature.user_value.trim(),
      },
      columns: { priority_impact: feature.impact, priority_effort: feature.effort },
    }
  }

  async function save() {
    const parsed = validate()
    if (!parsed) return
    setSaving(true)
    try {
      if (isCreate) {
        const row = await createElement(ctx, type, parsed.content, parsed.columns)
        onSaved(row as Record<string, unknown>)
        onToast('Élément créé.', 'ok')
      } else {
        const row = await editElement(
          ctx,
          {
            id: element.id,
            content: element.content,
            source: element.source ?? 'ai_generated',
          },
          parsed.content,
          parsed.columns
        )
        onSaved(row as Record<string, unknown>)
        onToast('Modifications enregistrées.', 'ok')
      }
      onClose()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Enregistrement impossible', 'err')
    } finally {
      setSaving(false)
    }
  }

  const title =
    isCreate
      ? type === 'persona'
        ? 'Ajouter un persona'
        : type === 'journey'
          ? 'Ajouter un parcours'
          : 'Ajouter une fonctionnalité'
      : 'Modifier'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900">
            Fermer
          </button>
        </div>

        {suggestion ? (
          <p className="mb-4 rounded-xl bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900">
            Piste de l’IA : {suggestion.label}. {suggestion.hint}
          </p>
        ) : null}

        <div className="space-y-4">
          {type === 'persona' ? (
            <>
              <Field label="Nom" error={errors.name}>
                <input className={inputClass} value={persona.name} onChange={(e) => setPersona({ ...persona, name: e.target.value })} />
              </Field>
              <Field label="Âge" error={errors.age}>
                <input className={inputClass} type="number" min={15} max={95} value={persona.age} onChange={(e) => setPersona({ ...persona, age: e.target.value })} />
              </Field>
              <Field label="Rôle" error={errors.role}>
                <input className={inputClass} value={persona.role} onChange={(e) => setPersona({ ...persona, role: e.target.value })} />
              </Field>
              <Field label="Contexte" error={errors.context}>
                <textarea className={inputClass} rows={3} value={persona.context} onChange={(e) => setPersona({ ...persona, context: e.target.value })} />
              </Field>
              <StringList
                label="Objectifs"
                values={persona.goals}
                errors={errors}
                prefix="goals"
                onChange={(goals) => setPersona({ ...persona, goals })}
              />
              <StringList
                label="Frustrations"
                values={persona.frustrations}
                errors={errors}
                prefix="frustrations"
                onChange={(frustrations) => setPersona({ ...persona, frustrations })}
              />
              <Field label="Citation" error={errors.quote}>
                <textarea className={inputClass} rows={2} value={persona.quote} onChange={(e) => setPersona({ ...persona, quote: e.target.value })} />
              </Field>
              <Field label="Confiance envers l’IA (1-5)">
                <input className={inputClass} type="number" min={1} max={5} value={persona.ai_trust_level} onChange={(e) => setPersona({ ...persona, ai_trust_level: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Autonomie préférée">
                <select className={inputClass} value={persona.preferred_autonomy} onChange={(e) => setPersona({ ...persona, preferred_autonomy: e.target.value as PersonaDraft['preferred_autonomy'] })}>
                  <option value="suggest">Suggère</option>
                  <option value="draft">Rédige</option>
                  <option value="act">Agit seule</option>
                </select>
              </Field>
            </>
          ) : null}

          {type === 'journey' ? (
            <>
              <Field label="Titre" error={errors.title}>
                <input className={inputClass} value={journey.title} onChange={(e) => setJourney({ ...journey, title: e.target.value })} />
              </Field>
              <Field label="Persona" error={errors.persona_name}>
                <input className={inputClass} value={journey.persona_name} onChange={(e) => setJourney({ ...journey, persona_name: e.target.value })} />
              </Field>
              {errors.steps ? <p className="text-xs text-red-600">{errors.steps}</p> : null}
              <div className="space-y-3">
                {journey.steps.map((step, index) => (
                  <div key={index} className="rounded-xl border border-zinc-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium">Étape {index + 1}</p>
                      <div className="flex gap-2">
                        <button type="button" disabled={index === 0} onClick={() => setJourney({ ...journey, steps: move(journey.steps, index, -1) })} className="text-xs text-zinc-500 disabled:opacity-40">Haut</button>
                        <button type="button" disabled={index === journey.steps.length - 1} onClick={() => setJourney({ ...journey, steps: move(journey.steps, index, 1) })} className="text-xs text-zinc-500 disabled:opacity-40">Bas</button>
                        <button type="button" disabled={journey.steps.length <= 4} onClick={() => setJourney({ ...journey, steps: journey.steps.filter((_, i) => i !== index) })} className="text-xs text-red-600 disabled:opacity-40">Supprimer</button>
                      </div>
                    </div>
                    <Field label="Étape" error={errors[`steps.${index}.stage`]}>
                      <input className={inputClass} value={step.stage} onChange={(e) => setJourney({ ...journey, steps: patchStep(journey.steps, index, { stage: e.target.value }) })} />
                    </Field>
                    <Field label="Action" error={errors[`steps.${index}.action`]}>
                      <input className={inputClass} value={step.action} onChange={(e) => setJourney({ ...journey, steps: patchStep(journey.steps, index, { action: e.target.value }) })} />
                    </Field>
                    <Field label="Émotion">
                      <select className={inputClass} value={step.emotion} onChange={(e) => setJourney({ ...journey, steps: patchStep(journey.steps, index, { emotion: e.target.value as StepDraft['emotion'] }) })}>
                        <option value="happy">Satisfait</option>
                        <option value="neutral">Neutre</option>
                        <option value="frustrated">Frustré</option>
                      </select>
                    </Field>
                    <Field label="Point de douleur">
                      <input className={inputClass} value={step.pain_point} onChange={(e) => setJourney({ ...journey, steps: patchStep(journey.steps, index, { pain_point: e.target.value }) })} />
                    </Field>
                    <Field label="Opportunité">
                      <input className={inputClass} value={step.opportunity} onChange={(e) => setJourney({ ...journey, steps: patchStep(journey.steps, index, { opportunity: e.target.value }) })} />
                    </Field>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={journey.steps.length >= 8}
                  onClick={() => setJourney({ ...journey, steps: [...journey.steps, emptyStep()] })}
                  className="text-sm font-medium text-indigo-700 disabled:opacity-40"
                >
                  + Ajouter une étape
                </button>
              </div>
            </>
          ) : null}

          {type === 'feature' ? (
            <>
              <Field label="Titre" error={errors.title}>
                <input className={inputClass} value={feature.title} onChange={(e) => setFeature({ ...feature, title: e.target.value })} />
              </Field>
              <Field label="Description" error={errors.description}>
                <textarea className={inputClass} rows={3} value={feature.description} onChange={(e) => setFeature({ ...feature, description: e.target.value })} />
              </Field>
              <Field label="Valeur utilisateur" error={errors.user_value}>
                <textarea className={inputClass} rows={2} value={feature.user_value} onChange={(e) => setFeature({ ...feature, user_value: e.target.value })} />
              </Field>
              <Field label="Impact (1-5)">
                <input className={inputClass} type="number" min={1} max={5} value={feature.impact} onChange={(e) => setFeature({ ...feature, impact: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
              <Field label="Effort (1-5)">
                <input className={inputClass} type="number" min={1} max={5} value={feature.effort} onChange={(e) => setFeature({ ...feature, effort: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
            </>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-sm text-zinc-600">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className={`${labelClass} mt-3 block`}>
      {label}
      {children}
      {error ? <span className="mt-1 block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  )
}

function StringList({
  label,
  values,
  errors,
  prefix,
  onChange,
}: {
  label: string
  values: string[]
  errors: Record<string, string>
  prefix: string
  onChange: (values: string[]) => void
}) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className="mt-2 space-y-2">
        {values.map((value, index) => (
          <div key={index}>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={value}
                onChange={(e) => onChange(values.map((item, i) => (i === index ? e.target.value : item)))}
              />
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                className="text-xs text-red-600"
              >
                Retirer
              </button>
            </div>
            {errors[`${prefix}.${index}`] ? (
              <p className="mt-1 text-xs text-red-600">{errors[`${prefix}.${index}`]}</p>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...values, ''])} className="mt-2 text-sm font-medium text-indigo-700">
        + Ajouter
      </button>
    </div>
  )
}

function patchStep(steps: StepDraft[], index: number, patch: Partial<StepDraft>) {
  return steps.map((step, i) => (i === index ? { ...step, ...patch } : step))
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const next = [...items]
  const target = index + direction
  if (target < 0 || target >= next.length) return items
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
