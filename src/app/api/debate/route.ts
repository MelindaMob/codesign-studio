import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'
export const maxDuration = 60

const OpinionSchema = z.object({
  stance: z.enum(['agree', 'concern', 'alternative']),
  comment: z.string().min(10).max(900),
})

const OPINION_TOOL: Anthropic.Tool = {
  name: 'submit_opinion',
  description: 'Submit your opinion on the feature under review.',
  input_schema: {
    type: 'object',
    properties: {
      stance: {
        type: 'string',
        enum: ['agree', 'concern', 'alternative'],
        description: '"agree" if you support the feature as-is, "concern" if you have a specific reservation, "alternative" if you would propose a different approach.',
      },
      comment: {
        type: 'string',
        description:
          '1 to 3 short sentences (aim for under 500 characters total), specific and actionable, from your role perspective. Plain text, no markdown.',
      },
    },
    required: ['stance', 'comment'],
  },
}

const AGENTS = [
  {
    role: 'ux_researcher' as const,
    label: 'UX Researcher',
    system: `You are a UX Researcher reviewing a product feature inside "CoDesign Studio". Judge it against real user needs, personas and journeys of this session. Be concrete: reference a specific persona's goal or frustration, or a journey pain point, when it supports your view. Write in the language of the brief. Call the submit_opinion tool with your answer.`,
  },
  {
    role: 'product_manager' as const,
    label: 'Product Manager',
    system: `You are a Product Manager reviewing a product feature inside "CoDesign Studio". Judge it against product priorities: value, scope, impact vs effort, business relevance. Write in the language of the brief. Call the submit_opinion tool with your answer.`,
  },
  {
    role: 'tech_lead' as const,
    label: 'Tech Lead',
    system: `You are a Tech Lead reviewing a product feature inside "CoDesign Studio". Judge it against feasibility: complexity, edge cases, data or integration needs, risk. Write in the language of the brief. Call the submit_opinion tool with your answer.`,
  },
]

export async function POST(req: NextRequest) {
  let body: { elementId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const elementId = body.elementId
  if (!elementId) return NextResponse.json({ error: 'elementId manquant' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY absente côté serveur' }, { status: 500 })
  const anthropic = new Anthropic({ apiKey })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: feature } = await supabase
    .from('elements')
    .select('*')
    .eq('id', elementId)
    .eq('type', 'feature')
    .single()
  if (!feature) return NextResponse.json({ error: 'Feature introuvable' }, { status: 404 })

  const sessionId = feature.session_id as string
  const { data: session } = await supabase.from('sessions').select('brief, mode').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })

  const { data: context } = await supabase
    .from('elements')
    .select('type, content')
    .eq('session_id', sessionId)
    .eq('status', 'validated')
    .in('type', ['persona', 'journey'])

  const contextBlock = context?.length
    ? `Validated personas and journeys:\n${context
        .map((c) => `- [${c.type}] ${JSON.stringify(c.content).slice(0, 400)}`)
        .join('\n')}`
    : 'No validated personas or journeys yet.'

  const prompt = `Product brief:\n${session.brief}\n\n${contextBlock}\n\nFeature under review:\n${JSON.stringify(
    feature.content
  )}`

  const started = Date.now()

  const results = await Promise.allSettled(
    AGENTS.map(async (agent) => {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 500,
        system: agent.system,
        messages: [{ role: 'user', content: prompt }],
        tools: [OPINION_TOOL],
        tool_choice: { type: 'tool', name: 'submit_opinion' },
      })

      const toolUse = msg.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_opinion'
      )

      if (!toolUse) {
        console.error(`Pas de tool_use pour ${agent.label}:`, JSON.stringify(msg.content))
        throw new Error(`Réponse invalide de ${agent.label}`)
      }

      const parsed = OpinionSchema.safeParse(toolUse.input)
      if (!parsed.success) {
        console.error(`Schéma invalide pour ${agent.label}:`, JSON.stringify(toolUse.input))
        throw new Error(`Réponse invalide de ${agent.label}`)
      }

      return {
        agent,
        data: parsed.data,
        tokensIn: msg.usage.input_tokens,
        tokensOut: msg.usage.output_tokens,
      }
    })
  )

  const opinions: { agent_role: string; stance: string; comment: string }[] = []
  const errors: string[] = []

  for (const r of results) {
    if (r.status === 'fulfilled') {
      opinions.push({ agent_role: r.value.agent.role, stance: r.value.data.stance, comment: r.value.data.comment })
    } else {
      errors.push(r.reason instanceof Error ? r.reason.message : 'Erreur agent')
    }
  }

  if (!opinions.length) {
    return NextResponse.json({ error: `Aucun agent n'a répondu (${errors.join(', ')})` }, { status: 502 })
  }

  const { error: deleteError } = await supabase.from('agent_opinions').delete().eq('element_id', elementId)
  if (deleteError) console.error('agent_opinions delete failed:', deleteError)

  const { data: inserted, error } = await supabase
    .from('agent_opinions')
    .insert(opinions.map((o) => ({ ...o, element_id: elementId, session_id: sessionId })))
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tokensIn = results.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value.tokensIn : 0), 0)
  const tokensOut = results.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value.tokensOut : 0), 0)

  const { error: runError } = await supabase.from('agent_runs').insert({
    session_id: sessionId,
    agent_role: 'debate',
    input: { elementId },
    output: { opinions, errors },
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: Date.now() - started,
  })
  if (runError) console.error('agent_runs insert failed:', runError)

  return NextResponse.json({ opinions: inserted, partial: errors.length > 0, errors })
}
