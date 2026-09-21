'use client'

export type StudioElement = {
  id: string
  type: string
  content: Record<string, unknown> | null
  source: string | null
  status: string | null
  confidence: number | null
  reasoning: string | null
  priority_impact: number | null
  priority_effort: number | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposé',
  validated: 'Validé',
  rejected: 'Rejeté',
  edited: 'Modifié',
}

const EMOTION_LABELS: Record<string, string> = {
  happy: 'Satisfait',
  neutral: 'Neutre',
  frustrated: 'Frustré',
}

function sourceLabel(source: string | null) {
  if (!source) return 'Inconnue'
  if (source === 'ai_generated') return 'IA'
  if (source.startsWith('human_')) return 'Humain'
  return source
}

function sourceClass(source: string | null) {
  if (source?.startsWith('human_')) {
    return 'bg-green-100 text-green-800'
  }
  return 'bg-violet-100 text-violet-800'
}

function PersonaBody({ content }: { content: Record<string, unknown> }) {
  const goals = asStringList(content.goals)
  const frustrations = asStringList(content.frustrations)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
          {asString(content.name) || 'Persona'}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          {asNumber(content.age) ? `${asNumber(content.age)} ans` : null}
          {asNumber(content.age) && asString(content.role) ? ' · ' : null}
          {asString(content.role)}
        </p>
      </div>
      {goals.length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Objectifs
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700">
            {goals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {frustrations.length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Frustrations
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700">
            {frustrations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {asString(content.quote) ? (
        <blockquote className="border-l-2 border-indigo-200 pl-3 text-sm text-zinc-600 italic">
          « {asString(content.quote)} »
        </blockquote>
      ) : null}
    </div>
  )
}

function JourneyBody({ content }: { content: Record<string, unknown> }) {
  const steps = Array.isArray(content.steps) ? content.steps : []

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
        {asString(content.title) || 'Parcours'}
      </h3>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const row = asRecord(step)
          const emotion = asString(row.emotion)
          return (
            <li key={`${asString(row.stage)}-${index}`} className="text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-900">
                    {index + 1}. {asString(row.stage) || 'Étape'}
                  </p>
                  <p className="mt-0.5 text-zinc-600">{asString(row.action)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {EMOTION_LABELS[emotion] ?? emotion}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FeatureBody({
  content,
  impact,
  effort,
}: {
  content: Record<string, unknown>
  impact: number | null
  effort: number | null
}) {
  const resolvedImpact = impact ?? asNumber(content.impact)
  const resolvedEffort = effort ?? asNumber(content.effort)

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
        {asString(content.title) || 'Fonctionnalité'}
      </h3>
      <p className="text-sm text-zinc-700">{asString(content.description)}</p>
      {asString(content.user_value) ? (
        <p className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">Valeur utilisateur : </span>
          {asString(content.user_value)}
        </p>
      ) : null}
      <div className="flex gap-4 text-sm text-zinc-600">
        {resolvedImpact != null ? <span>Impact {resolvedImpact}/5</span> : null}
        {resolvedEffort != null ? <span>Effort {resolvedEffort}/5</span> : null}
      </div>
    </div>
  )
}

export function ElementCard({ element }: { element: StudioElement }) {
  const content = asRecord(element.content)
  const confidence = Math.round(Math.min(Math.max(element.confidence ?? 0, 0), 1) * 100)
  const status = element.status ?? ''

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sourceClass(element.source)}`}
        >
          {sourceLabel(element.source)}
        </span>
        {status ? (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            {STATUS_LABELS[status] ?? status}
          </span>
        ) : null}
      </div>

      {element.type === 'persona' ? (
        <PersonaBody content={content} />
      ) : element.type === 'journey' ? (
        <JourneyBody content={content} />
      ) : (
        <FeatureBody
          content={content}
          impact={element.priority_impact}
          effort={element.priority_effort}
        />
      )}

      <div className="mt-5 space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Confiance</span>
          <span>{confidence}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-indigo-500"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {element.reasoning ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-indigo-700">
            Raisonnement
          </summary>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{element.reasoning}</p>
        </details>
      ) : null}
    </article>
  )
}
