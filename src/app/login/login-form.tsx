'use client'

import { useActionState } from 'react'
import { login, signup, type AuthState } from './actions'

const initialState: AuthState = { error: null, message: null }

export function LoginForm() {
  const [loginState, loginAction, loginPending] = useActionState(
    login,
    initialState
  )
  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    initialState
  )

  const pending = loginPending || signupPending
  const error = loginState.error || signupState.error
  const message = signupState.message

  return (
    <form action={loginAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-base font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Mot de passe
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-base font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </label>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          {message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {loginPending ? 'Connexion…' : 'Se connecter'}
        </button>
        <button
          type="submit"
          formAction={signupAction}
          disabled={pending}
          className="h-11 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          {signupPending ? 'Création…' : 'Créer un compte'}
        </button>
      </div>
    </form>
  )
}
