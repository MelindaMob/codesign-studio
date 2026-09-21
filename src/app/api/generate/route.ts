import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { schemas, type ElementKind } from '@/lib/schemas'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'

export const maxDuration = 60

type SessionRow = {
  brief: string | null
  mode: string | null
}

type ElementContextRow = {
  type: string
  content: unknown
}

type InsertedElement = {
  id: string
}

// Quels éléments VALIDÉS servent de contexte pour chaque type
const CONTEXT_TYPES: Record<ElementKind, ElementKind[]> = {
  persona: [],
  journey: ['persona'],
  feature: ['persona', 'journey'],
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sessionId: string = body.sessionId
  const type: ElementKind = body.type
  const count = Math.min(Math.max(Number(body.count) || 3, 1), 6)

  if (!schemas[type]) return new Response('Type invalide', { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Non connecté', { status: 401 })

  // La RLS garantit qu'on ne lit que les sessions auxquelles l'utilisateur a accès
  const { data: sessionData } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  const session = sessionData as SessionRow | null
  if (!session) return new Response('Session introuvable', { status: 404 })
  const brief = session.brief
  if (!brief?.trim()) return new Response('Le brief de la session est vide', { status: 400 })

  let context: { type: string; content: unknown }[] = []
  const ctxTypes = CONTEXT_TYPES[type]
  if (ctxTypes.length) {
    const { data } = await supabase
      .from('elements')
      .select('type, content')
      .eq('session_id', sessionId)
      .eq('status', 'validated')
      .in('type', ctxTypes)
    context = (data as ElementContextRow[] | null) ?? []
    if (!context.some((c) => c.type === 'persona')) {
      return new Response('Valide au moins un persona avant de générer la suite', { status: 400 })
    }
  }

  const { count: existing } = await supabase
    .from('elements')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('type', type)
  let position = existing ?? 0

  const encoder = new TextEncoder()
  const started = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      const rawLines: string[] = []

      // Traite UNE ligne JSON complète renvoyée par le modèle
      const handleLine = async (line: string) => {
        if (line.startsWith('```')) return
        rawLines.push(line)

        let json: unknown
        try {
          json = JSON.parse(line)
        } catch {
          send({ type: 'invalid', reason: 'json_parse' })
          return
        }

        const parsed = schemas[type].safeParse(json)
        if (!parsed.success) {
          send({ type: 'invalid', reason: 'schema', issues: parsed.error.issues.slice(0, 3) })
          return
        }

        // On sépare les métadonnées (colonnes dédiées) du contenu (jsonb)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { confidence, reasoning, impact, effort, ...content } = parsed.data as any

        const { data: elData, error } = await supabase
          .from('elements')
          .insert({
            session_id: sessionId,
            type,
            content,
            source: 'ai_generated',
            status: 'proposed',
            confidence,
            reasoning,
            priority_impact: impact ?? null,
            priority_effort: effort ?? null,
            created_by_agent: 'generator',
            position: position++,
          })
          .select()
          .single()

        const el = elData as InsertedElement | null

        if (error || !el) {
          send({ type: 'error', message: error?.message ?? 'Insertion impossible' })
          return
        }

        await supabase.from('element_versions').insert({
          element_id: el.id,
          session_id: sessionId,
          version_number: 1,
          branch: 'main',
          content,
          author: 'ai',
        })

        await supabase.from('events').insert({
          session_id: sessionId,
          user_id: user.id,
          mode: session.mode,
          event_type: 'card_generated',
          element_id: el.id,
          payload: { type },
        })

        send({ type: 'element', element: el })
      }

      try {
        const llm = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: buildUserPrompt({ type, count, brief, context }),
            },
          ],
        })

        // On découpe le flux texte ligne par ligne : chaque ligne = un objet JSON = une carte
        let buffer = ''
        for await (const event of llm) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            buffer += event.delta.text
            let i: number
            while ((i = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, i).trim()
              buffer = buffer.slice(i + 1)
              if (line) await handleLine(line)
            }
          }
        }
        if (buffer.trim()) await handleLine(buffer.trim())

        const final = await llm.finalMessage()
        await supabase.from('agent_runs').insert({
          session_id: sessionId,
          agent_role: 'generator',
          input: { type, count },
          output: { lines: rawLines },
          model: MODEL,
          tokens_in: final.usage.input_tokens,
          tokens_out: final.usage.output_tokens,
          latency_ms: Date.now() - started,
        })

        send({ type: 'done' })
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Erreur inconnue' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
