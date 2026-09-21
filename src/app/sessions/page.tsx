import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './actions'
import { NewSessionButton } from './new-session-button'

type SessionRow = {
  id: string
  title: string | null
  mode: 'suggest' | 'draft' | 'act'
  created_at: string
}

export default async function SessionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, title, mode, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  const rows = (sessions ?? []) as SessionRow[]

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 bg-zinc-50 px-6 py-12 text-zinc-900">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium tracking-wide text-indigo-700 uppercase">
            CoDesign Studio
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <form action={signOut}>
            <button
              type="submit"
              className="h-10 rounded-lg px-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Déconnexion
            </button>
          </form>
          <NewSessionButton />
        </div>
      </header>

      {error ? (
        <p className="text-sm text-red-600">{error.message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
          Aucune session. Cliquez sur « Nouvelle session » pour commencer.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {rows.map((session) => (
            <li key={session.id}>
              <Link
                href={`/sessions/${session.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-indigo-50/60"
              >
                <div>
                  <p className="font-medium">
                    {session.title?.trim() || `Session ${session.id.slice(0, 8)}`}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {new Date(session.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium tracking-wide text-indigo-700 uppercase">
                  {session.mode}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
