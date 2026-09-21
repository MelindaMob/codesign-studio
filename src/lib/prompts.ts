import type { ElementKind } from './schemas'

export type PromptSource = {
  ref: string
  content: string
  page: number | null
  filename?: string
}

export const SYSTEM_PROMPT = `You are the AI co-designer inside "CoDesign Studio", a tool where product designers and product managers build personas, user journeys and features together with you.

Rules:
- Write all content in the language of the product brief.
- Output ONLY JSON Lines: exactly one valid JSON object per line. No array, no markdown fences, no commentary before or after.
- Follow the requested shape exactly. No extra keys.
- Grounding: when source excerpts are provided, ground the items in them and list the refs of the excerpts that support each item in "source_ids" (e.g. ["S1","S4"]). Use [] when nothing supports the item. NEVER invent a ref that was not provided. Do not attribute to a source anything it does not say.
- "confidence" is a number between 0 and 1 and must be honest. An item with no supporting excerpt is a hypothesis built from the brief alone: confidence 0.6 or lower. An item directly supported by excerpts may go up to 0.9.
- "reasoning" is 1-3 sentences explaining why you propose this item, which excerpts or parts of the brief it relies on, and what is assumed rather than sourced.
- Avoid stereotypes. Never infer traits from gender, age or origin alone.`

const SPECS: Record<ElementKind, { label: string; guidance: string; example: string }> = {
  persona: {
    label: 'personas',
    guidance:
      'Make the personas clearly different from each other: vary age, gender, cultural background, tech proficiency and attitude toward AI. Goals and frustrations must be concrete and specific to the product brief (2-4 each). When excerpts describe real users, base the personas on them. "ai_trust_level" is 1 (distrustful) to 5 (fully trusting). "preferred_autonomy" is one of suggest, draft, act.',
    example:
      '{"name":"...","age":34,"role":"...","context":"...","goals":["...","..."],"frustrations":["...","..."],"quote":"...","ai_trust_level":3,"preferred_autonomy":"draft","source_ids":["S1"],"confidence":0.5,"reasoning":"..."}',
  },
  journey: {
    label: 'user journeys (one per line, each about one of the validated personas)',
    guidance:
      'Each journey has 4 to 8 steps from discovery to outcome. "emotion" is one of happy, neutral, frustrated. Use null for "pain_point" or "opportunity" when there is none. "persona_name" must match a validated persona name exactly.',
    example:
      '{"title":"...","persona_name":"...","steps":[{"stage":"...","action":"...","emotion":"neutral","pain_point":null,"opportunity":"..."}],"source_ids":["S2"],"confidence":0.5,"reasoning":"..."}',
  },
  feature: {
    label: 'product features',
    guidance:
      'Features must answer pain points and opportunities found in the validated personas and journeys. "impact" and "effort" are integers from 1 (low) to 5 (high). "user_value" says what the user gains, in one sentence.',
    example:
      '{"title":"...","description":"...","user_value":"...","impact":4,"effort":2,"source_ids":[],"confidence":0.5,"reasoning":"..."}',
  },
}

export function buildUserPrompt(args: {
  type: ElementKind
  count: number
  brief: string
  context: { type: string; content: unknown }[]
  sources: PromptSource[]
  extra?: string
}) {
  const { type, count, brief, context, sources, extra } = args
  const spec = SPECS[type]

  const ctx = context.length
    ? `\n\nValidated items to build on:\n${context
        .map((c) => `- [${c.type}] ${JSON.stringify(c.content)}`)
        .join('\n')}`
    : ''

  const src = sources.length
    ? `\n\nSource excerpts (cite the ones that support each item in "source_ids", using their refs):\n${sources
        .map(
          (s) =>
            `[${s.ref}] (${s.filename ?? 'document'}${s.page ? `, p.${s.page}` : ''}) ${s.content.slice(0, 900)}`
        )
        .join('\n\n')}`
    : '\n\nNo source documents were provided: everything you generate is a hypothesis, use "source_ids": [].'

  return `Product brief:\n${brief}${ctx}${src}

Generate exactly ${count} ${spec.label}.
${spec.guidance}

Each line must follow this shape:
${spec.example}${extra ? `\n\n${extra}` : ''}`
}