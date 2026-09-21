'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type DocumentRow = {
  id: string
  filename: string
  created_at: string
  chunkCount: number
}

type DocumentsPanelProps = {
  sessionId: string
}

function mapDocuments(data: unknown[] | null): DocumentRow[] {
  return (data ?? []).map((item) => {
    const row = item as {
      id: string
      filename?: string | null
      created_at: string
      chunks?: { count: number }[] | null
    }
    const count = Array.isArray(row.chunks) ? (row.chunks[0]?.count ?? 0) : 0
    return {
      id: row.id,
      filename: row.filename ?? 'Sans nom',
      created_at: row.created_at,
      chunkCount: count,
    }
  })
}

export function DocumentsPanel({ sessionId }: DocumentsPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from('documents')
        .select('id, filename, created_at, chunks(count)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (queryError) {
        setError(queryError.message)
        setDocuments([])
      } else {
        setError(null)
        setDocuments(mapDocuments(data as unknown[] | null))
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  async function refresh() {
    const supabase = createClient()
    const { data, error: queryError } = await supabase
      .from('documents')
      .select('id, filename, created_at, chunks(count)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      return
    }

    setError(null)
    setDocuments(mapDocuments(data as unknown[] | null))
  }

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choisissez un fichier PDF, TXT ou MD.')
      return
    }

    setUploading(true)
    setError(null)

    const form = new FormData()
    form.append('file', file)
    form.append('sessionId', sessionId)

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: form,
      })
      const payload = (await res.json()) as { error?: string }
      if (!res.ok || payload.error) {
        setError(payload.error ?? 'Analyse impossible.')
      } else {
        if (fileRef.current) fileRef.current.value = ''
        await refresh()
      }
    } catch {
      setError('Analyse impossible.')
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string, filename: string) {
    if (!confirm(`Supprimer « ${filename} » et ses extraits ?`)) return

    setError(null)
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('documents').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md"
          disabled={uploading}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <button
          type="button"
          onClick={() => void upload()}
          disabled={uploading}
          className="h-10 shrink-0 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {uploading ? 'Analyse du document...' : 'Ajouter un document'}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Chargement des documents…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucun document source pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">{doc.filename}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {new Date(doc.created_at).toLocaleString('fr-FR')}
                  {' · '}
                  {doc.chunkCount} extrait{doc.chunkCount > 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(doc.id, doc.filename)}
                className="text-sm font-medium text-zinc-500 transition-colors hover:text-red-600"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
