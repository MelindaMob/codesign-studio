import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { retrieveSources } from '@/lib/retrieval'
import type { ElementKind } from '@/lib/schemas'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'

export const maxDuration = 60

const SuggestionSchema = z.object({
  label: z.string().min(1).max(80),
  hint: z.string().min(1).max(220),
})

const CONTEXT_TYPES: Record<ElementKind, ElementKind[]> = {
  persona: [],
  journey: ['persona'],
  feature: ['persona', 'journey'],
}

const WHAT: Record<ElementKind, string> = {
  persona: 'user personas worth writing (a type of user to describe)',
  journey: 'user journeys worth mapping (a situation or scenario, tied to one of the existing personas)',
  feature: 'product features worth considering (tied to the pain points of the existing personas and journeys)',
}

const SYSTEM = `You are a discreet assistant inside "CoDesign Studio". The human designer writes everything; you only suggest short ideas to explore.

Rules:
- Write in the language of the product brief.
- Output ONLY JSON Lines: one JSON object per line, shaped {"label":"...","hint":"..."}. No array, no markdown, no commentary.
- "label" is 2 to 6 words naming the idea. "hint" is ONE sentence (max 25 words) saying what to explore and why. NEVER write a full persona, journey or feature.
- Suggestions must be clearly different from each other and from the existing items.
- Base them on the brief and on the source excerpts when provided. Do not attribute to a source anything it does not say.`

const labelOf = (c: unknown) => {
  const o = (c ?? {}) as Record<string, unknown>
  return String(o.name ?? o.title ?? '').trim()
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sessionId: string = body.sessionId
  const type: ElementKind = body.type
  const count = Math.min(Math.max(Number(body.count) || 4, 2), 6)

  if (!CONTEXT_TYPES[type]) return NextResponse.json({ error: 'Type invalide' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY absente côté serveur' }, { status: 500 })
  const anthropic = new Anthropic({ apiKey })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  if (!session.brief?.trim()) {
    return NextResponse.json({ error: 'Le brief de la session est vide' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('elements')
    .select('type, content')
    .eq('session_id', sessionId)
    .neq('status', 'rejected')

  const sameType = (existing ?? []).filter((e) => e.type === type).map((e) => labelOf(e.content)).filter(Boolean)
  const context = (existing ?? []).filter((e) => CONTEXT_TYPES[type].includes(e.type as ElementKind))

  let sources: Awaited<ReturnType<typeof retrieveSources>> = []
  try {
    sources = await retrieveSources(supabase, { sessionId, type, brief: session.brief, limit: 5 })
  } catch (e) {
    return NextResponse.json(
      { error: `Recherche dans les documents impossible : ${e instanceof Error ? e.message : 'erreur'}` },
      { status: 500 }
    )
  }

  const prompt = [
    `Product brief:\n${session.brief}`,
    context.length
      ? `Existing items to build on:\n${context
          .map((c) => `- [${c.type}] ${JSON.stringify(c.content).slice(0, 400)}`)
          .join('\n')}`
      : '',
    sameType.length ? `Already in the session (do not repeat): ${sameType.join(', ')}` : '',
    sources.length
      ? `Source excerpts:\n${sources
          .map((s) => `[${s.ref}] (${s.filename ?? 'document'}${s.page ? `, p.${s.page}` : ''}) ${s.content.slice(0, 600)}`)
          .join('\n\n')}`
      : '',
    `Suggest exactly ${count} ideas for ${WHAT[type]}.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const started = Date.now()
  let text = ''
  let tokensIn = 0
  let tokensOut = 0

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    tokensIn = msg.usage.input_tokens
    tokensOut = msg.usage.output_tokens
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur du modèle' }, { status: 502 })
  }

  const suggestions = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .flatMap((l) => {
      try {
        const r = SuggestionSchema.safeParse(JSON.parse(l))
        return r.success ? [r.data] : []
      } catch {
        return []
      }
    })
    .slice(0, count)

  if (!suggestions.length) {
    return NextResponse.json({ error: 'Aucune suggestion exploitable, réessaie' }, { status: 502 })
  }

  await supabase.from('events').insert({
    session_id: sessionId,
    user_id: user.id,
    mode: session.mode,
    event_type: 'suggestion_shown',
    payload: { type, labels: suggestions.map((s) => s.label) },
  })

  await supabase.from('agent_runs').insert({
    session_id: sessionId,
    agent_role: 'suggester',
    input: { type, count, sources: sources.map((s) => s.id) },
    output: { suggestions },
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: Date.now() - started,
  })

  return NextResponse.json({ suggestions })
}
