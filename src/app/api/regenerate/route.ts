import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { schemas, type ElementKind } from '@/lib/schemas'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/prompts'
import { retrieveSources, type Source } from '@/lib/retrieval'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'

export const maxDuration = 60

const CONTEXT_TYPES: Record<ElementKind, ElementKind[]> = {
  persona: [],
  journey: ['persona'],
  feature: ['persona', 'journey'],
}

export async function POST(req: NextRequest) {
  const { elementId, feedback } = (await req.json()) as { elementId: string; feedback?: string }
  const cleanFeedback = feedback?.trim().slice(0, 500) || null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY absente côté serveur' }, { status: 500 })
  const anthropic = new Anthropic({ apiKey })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: element } = await supabase.from('elements').select('*').eq('id', elementId).single()
  if (!element) return NextResponse.json({ error: 'Élément introuvable' }, { status: 404 })

  const type = element.type as ElementKind
  const sessionId = element.session_id as string

  const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
  if (!session?.brief?.trim()) {
    return NextResponse.json({ error: 'Le brief de la session est vide' }, { status: 400 })
  }

  // Contexte : éléments validés dont dépend ce type
  let context: { type: string; content: unknown }[] = []
  const ctxTypes = CONTEXT_TYPES[type]
  if (ctxTypes.length) {
    const { data } = await supabase
      .from('elements')
      .select('type, content')
      .eq('session_id', sessionId)
      .eq('status', 'validated')
      .in('type', ctxTypes)
    context = data ?? []
  }

  // Les autres éléments du même type : le nouveau doit s'en distinguer
  const { data: siblings } = await supabase
    .from('elements')
    .select('content')
    .eq('session_id', sessionId)
    .eq('type', type)
    .neq('id', elementId)
    .neq('status', 'rejected')
    .limit(6)

  let sources: Source[] = []
  try {
    sources = await retrieveSources(supabase, {
      sessionId,
      type,
      brief: session.brief,
      hint: cleanFeedback ?? undefined,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `Recherche dans les documents impossible : ${e instanceof Error ? e.message : 'erreur'}` },
      { status: 500 }
    )
  }

  const extra = [
    'You are REPLACING one existing item with a single new one (count = 1).',
    `Current version (do NOT repeat it, propose a clearly different or improved alternative):\n${JSON.stringify(element.content)}`,
    cleanFeedback
      ? `The user gave this feedback, apply it: "${cleanFeedback}"`
      : 'No feedback was given: propose a meaningfully different take.',
    siblings?.length
      ? `Other items already in the session (be different from them):\n${siblings
          .map((s) => `- ${JSON.stringify(s.content)}`)
          .join('\n')}`
      : '',
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
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt({ type, count: 1, brief: session.brief, context, sources, extra }),
        },
      ],
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

  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('{'))

  let json: unknown
  try {
    json = JSON.parse(line ?? '')
  } catch {
    return NextResponse.json({ error: 'Réponse du modèle illisible, réessaie' }, { status: 502 })
  }

  const parsed = schemas[type].safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Réponse du modèle invalide, réessaie' }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { confidence, reasoning, impact, effort, source_ids, ...content } = parsed.data as any

  const cited = ((source_ids ?? []) as string[])
    .map((ref) => sources.find((s) => s.ref === ref))
    .filter((s): s is Source => Boolean(s))
  const finalConfidence = cited.length ? confidence : Math.min(confidence, 0.6)

  // L'élément reprend sa place : nouveau contenu IA, de nouveau "à valider"
  const { data: updated, error } = await supabase
    .from('elements')
    .update({
      content,
      source: 'ai_generated',
      status: 'proposed',
      confidence: finalConfidence,
      reasoning,
      priority_impact: impact ?? element.priority_impact,
      priority_effort: effort ?? element.priority_effort,
      created_by_agent: 'generator',
      updated_at: new Date().toISOString(),
    })
    .eq('id', elementId)
    .select()
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Mise à jour impossible' }, { status: 500 })
  }

  // Citations : on remplace les anciennes
  await supabase.from('element_sources').delete().eq('element_id', elementId)
  if (cited.length) {
    await supabase
      .from('element_sources')
      .insert(cited.map((c) => ({ element_id: elementId, chunk_id: c.id, session_id: sessionId })))
  }

  // Nouvelle version (l'ancienne, y compris les retouches humaines, reste dans l'historique)
  const { data: last } = await supabase
    .from('element_versions')
    .select('version_number')
    .eq('element_id', elementId)
    .eq('branch', 'main')
    .order('version_number', { ascending: false })
    .limit(1)

  await supabase.from('element_versions').insert({
    element_id: elementId,
    session_id: sessionId,
    version_number: (last?.[0]?.version_number ?? 0) + 1,
    branch: 'main',
    content,
    author: 'ai',
  })

  await supabase.from('events').insert({
    session_id: sessionId,
    user_id: user.id,
    mode: session.mode,
    event_type: 'card_regenerated',
    element_id: elementId,
    payload: { feedback: cleanFeedback, previous_source: element.source, citations: cited.length },
  })

  await supabase.from('agent_runs').insert({
    session_id: sessionId,
    agent_role: 'generator',
    input: { regenerate: elementId, feedback: cleanFeedback, sources: sources.map((s) => s.id) },
    output: { line },
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: Date.now() - started,
  })

  return NextResponse.json({
    element: {
      ...updated,
      citations: cited.map((c) => ({
        ref: c.ref,
        chunk_id: c.id,
        filename: c.filename,
        page: c.page,
        excerpt: c.content.slice(0, 300),
      })),
    },
  })
}
