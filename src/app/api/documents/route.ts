import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'
import { createClient } from '@/lib/supabase/server'
import { chunkText } from '@/lib/chunking'
import { embedTexts } from '@/lib/embeddings'

export const maxDuration = 60

const MAX_SIZE = 10 * 1024 * 1024 // 10 Mo
const MAX_CHUNKS = 300 // garde-fou sur le coût d'embeddings

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const sessionId = form.get('sessionId') as string | null

  if (!file || !sessionId) {
    return NextResponse.json({ error: 'Fichier ou session manquants' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Fichier trop lourd (10 Mo max)' }, { status: 413 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { data: session } = await supabase.from('sessions').select('id').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })

  // 1. Extraction du texte, page par page pour les PDF
  const name = file.name.toLowerCase()
  const isPdf = name.endsWith('.pdf')
  const buffer = new Uint8Array(await file.arrayBuffer())
  let pages: string[]

  try {
    if (isPdf) {
      const pdf = await getDocumentProxy(buffer)
      const { text } = await extractText(pdf, { mergePages: false })
      pages = text
    } else if (name.endsWith('.txt') || name.endsWith('.md')) {
      pages = [new TextDecoder().decode(buffer)]
    } else {
      return NextResponse.json({ error: 'Formats acceptés : PDF, TXT, MD' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Lecture du fichier impossible' }, { status: 422 })
  }

  // 2. Découpage en chunks (on garde le numéro de page pour les citations)
  const pieces = pages.flatMap((t, i) =>
    chunkText(t).map((content) => ({ content, page: isPdf ? i + 1 : null }))
  )

  if (pieces.length === 0) {
    return NextResponse.json(
      { error: 'Aucun texte extractible (PDF scanné ? il faudrait de l\'OCR)' },
      { status: 422 }
    )
  }
  if (pieces.length > MAX_CHUNKS) {
    return NextResponse.json(
      { error: `Document trop long (${pieces.length} extraits, max ${MAX_CHUNKS})` },
      { status: 413 }
    )
  }

  // 3. Embeddings
  let embeddings: number[][]
  try {
    embeddings = await embedTexts(pieces.map((p) => p.content))
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Embeddings impossibles' },
      { status: 500 }
    )
  }

  // 4. Insertion du document puis des chunks
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({ session_id: sessionId, filename: file.name, storage_path: null })
    .select()
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? 'Insertion impossible' }, { status: 500 })
  }

  const rows = pieces.map((p, i) => ({
    document_id: (doc as { id: string }).id,
    session_id: sessionId,
    content: p.content,
    page: p.page,
    embedding: embeddings[i],
  }))

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('chunks').insert(rows.slice(i, i + 100))
    if (error) {
      await supabase.from('documents').delete().eq('id', (doc as { id: string }).id) // les chunks partent en cascade
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ document: doc, chunks: rows.length })
}
