'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { logEvent } from '@/lib/events'
import { createClient } from '@/lib/supabase/client'

export function NewSessionButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createSession() {
    setPending(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert({
        owner_id: user.id,
        mode: 'suggest',
        title: `Session du ${new Date().toLocaleString('fr-FR')}`,
      })
      .select('id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? 'Impossible de créer la session.')
      setPending(false)
      return
    }

    await logEvent({
      sessionId: data.id,
      mode: 'suggest',
      type: 'session_started',
    })

    router.refresh()
    setPending(false)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={createSession}
        disabled={pending}
        className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? 'Création…' : 'Nouvelle session'}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
