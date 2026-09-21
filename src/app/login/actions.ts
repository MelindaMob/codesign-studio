'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type AuthState = {
  error: string | null
  message: string | null
}

const credentialsSchema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  password: z
    .string()
    .min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
})

function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  })
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = parseCredentials(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', message: null }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: error.message, message: null }
  }

  revalidatePath('/', 'layout')
  redirect('/sessions')
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = parseCredentials(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', message: null }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp(parsed.data)

  if (error) {
    return { error: error.message, message: null }
  }

  if (!data.session) {
    return {
      error: null,
      message: 'Compte créé. Vérifiez votre e-mail pour confirmer l’inscription.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/sessions')
}
