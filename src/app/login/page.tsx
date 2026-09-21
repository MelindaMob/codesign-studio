import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="mb-2 text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Codesign Studio
        </p>
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Connexion</h1>
        <LoginForm />
      </div>
    </main>
  )
}
