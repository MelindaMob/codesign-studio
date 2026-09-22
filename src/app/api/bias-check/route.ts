import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'
export const maxDuration = 60

const FlagSchema = z.object({
  persona_name: z.string().min(1),
  issue: z.string().min(5).max(500),
  severity: z.enum(['low', 'medium', 'high']),
})

const ReportSchema = z.object({
  diversity_score: z.number().min(0).max(1),
  summary: z.string().min(5).max(400),
  flags: z.array(FlagSchema).max(10),
})

const BIAS_TOOL: Anthropic.Tool = {
  name: 'submit_bias_report',
  description: 'Submit a diversity and bias analysis of a set of personas.',
  input_schema: {
    type: 'object',
    properties: {
      diversity_score: {
        type: 'number',
        description:
          '0 (personas are near-identical or strongly stereotyped) to 1 (personas are meaningfully diverse in age, gender, cultural background, tech attitude, and avoid stereotypes).',
      },
      summary: { type: 'string', description: 'One or two sentences summarizing the overall diversity of the set.' },
      flags: {
        type: 'array',
        description: 'Specific issues found. Empty array if none.',
        items: {
          type: 'object',
          properties: {
            persona_name: { type: 'string', description: 'Exact name of the persona this flag is about.' },
            issue: { type: 'string', description: 'One short sentence (aim for under 300 characters) describing the stereotype or lack of diversity issue.' },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['persona_name', 'issue', 'severity'],
        },
      },
    },
    required: ['diversity_score', 'summary', 'flags'],
  },
}

const SYSTEM = `You are a bias and diversity reviewer for a set of user personas used in a product design tool. Check for: lack of variety in age, gender, cultural background, tech proficiency and attitude toward AI; stereotypical traits inferred from gender, age or origin (e.g. assuming older people are all technophobic, or assuming a gender for a given job); goals/frustrations that are too similar across personas. Call the submit_bias_report tool with your answer. Write "summary" and "issue" fields in the language of the brief.`

export async function POST(req: NextRequest) {
  let body: { sessionId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const sessionId = body.sessionId
  if (!sessionId) return NextResponse.json({ error: 'sessionId manquant' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY absente côté serveur' }, { status: 500 })
  const anthropic = new Anthropic({ apiKey })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: session } = await supabase.from('sessions').select('mode').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })

  const { data: personas } = await supabase
    .from('elements')
    .select('id, content')
    .eq('session_id', sessionId)
    .eq('type', 'persona')
    .neq('status', 'rejected')

  if (!personas || personas.length < 2) {
    return NextResponse.json({ error: 'Il faut au moins 2 personas non rejetés à analyser' }, { status: 400 })
  }

  const prompt = `Personas to analyze:\n${personas.map((p, i) => `${i + 1}. ${JSON.stringify(p.content)}`).join('\n')}`

  const started = Date.now()
  let msg
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      tools: [BIAS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_bias_report' },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur du modèle' }, { status: 502 })
  }

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_bias_report'
  )
  if (!toolUse) {
    console.error('Pas de tool_use pour bias-check:', JSON.stringify(msg.content))
    return NextResponse.json({ error: 'Réponse invalide du modèle' }, { status: 502 })
  }

  const parsed = ReportSchema.safeParse(toolUse.input)
  if (!parsed.success) {
    console.error('Schéma invalide pour bias-check:', JSON.stringify(toolUse.input))
    return NextResponse.json({ error: 'Réponse invalide du modèle' }, { status: 502 })
  }

  // On relie chaque alerte à l'id réel du persona (par nom)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byName = new Map(personas.map((p) => [String((p.content as any)?.name ?? ''), p.id]))
  const flags = parsed.data.flags.map((f) => ({ ...f, element_id: byName.get(f.persona_name) ?? null }))

  const { data: report, error } = await supabase
    .from('bias_reports')
    .insert({
      session_id: sessionId,
      element_type: 'persona',
      diversity_score: parsed.data.diversity_score,
      flags: { summary: parsed.data.summary, items: flags },
    })
    .select()
    .single()

  if (error || !report) {
    return NextResponse.json({ error: error?.message ?? 'Insertion impossible' }, { status: 500 })
  }

  if (flags.length > 0) {
    const { error: evError } = await supabase.from('events').insert({
      session_id: sessionId,
      user_id: user.id,
      mode: session.mode,
      event_type: 'bias_alert_shown',
      payload: { report_id: report.id, flags: flags.length, diversity_score: parsed.data.diversity_score },
    })
    if (evError) console.error('bias_alert_shown insert failed:', evError)
  }

  const { error: runError } = await supabase.from('agent_runs').insert({
    session_id: sessionId,
    agent_role: 'bias_checker',
    input: { personas: personas.map((p) => p.id) },
    output: parsed.data,
    model: MODEL,
    tokens_in: msg.usage.input_tokens,
    tokens_out: msg.usage.output_tokens,
    latency_ms: Date.now() - started,
  })
  if (runError) console.error('agent_runs insert failed:', runError)

  return NextResponse.json({ report })
}
