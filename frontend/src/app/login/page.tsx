'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const data = new FormData(e.currentTarget)
    const email = data.get('email') as string
    const password = data.get('password') as string

    try {
      await signIn(email, password)
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.'
      setError(msg.includes('Invalid login') ? 'Invalid email or password.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1fr]">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(30,64,175,0.18),_transparent_24%),linear-gradient(180deg,_#16233b_0%,_#1a2437_100%)] px-8 py-10 text-white lg:px-14 lg:py-14">
          <div className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-9 flex h-28 w-28 items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/9 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_rgba(6,10,18,0.28)] backdrop-blur-sm">
              <Image
                src="/spokes-digital-logo.png"
                alt="Spokes Digital logo"
                width={84}
                height={84}
                priority
                className="h-[84px] w-[84px] object-contain"
              />
            </div>

            <h1 className="text-[2.2rem] font-semibold tracking-[-0.045em] text-white sm:text-[2.9rem]">
              Spokes Digital
            </h1>

            <p className="mt-4 max-w-[28rem] text-[0.96rem] leading-[1.5] font-light tracking-[-0.015em] text-[#c3cbdb] sm:text-[1.05rem]">
              AI-powered marketing analytics built for dispensaries and e-commerce brands.
              Understand your ad performance in minutes, not hours.
            </p>

            <div className="mt-12 grid w-full max-w-lg grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#f6b900]">7×</p>
                <p className="mt-1 text-sm text-[#929eb6]">Avg ROAS</p>
              </div>
              <div>
                <p className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#f6b900]">94%</p>
                <p className="mt-1 text-sm text-[#929eb6]">Client Retention</p>
              </div>
              <div>
                <p className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#f6b900]">150+</p>
                <p className="mt-1 text-sm text-[#929eb6]">Brands</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-[29rem]">
            <div>
              <h2 className="text-[2.15rem] font-semibold tracking-[-0.04em] text-[#1f2633]">
                Welcome
              </h2>
              <p className="mt-2 text-[1rem] text-[#71798a]">
                Sign in to view your dashboard
              </p>
            </div>

            <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-[0.98rem] font-medium tracking-[-0.02em] text-[#202736]"
                >
                  Username
                </label>
                <input
                  id="email"
                  name="email"
                  type="text"
                  required
                  autoComplete="username"
                  className="mt-3 h-14 w-full rounded-[1rem] border border-[#e6ddd1] bg-white px-4.5 text-[0.98rem] text-[#202736] shadow-[0_1px_2px_rgba(15,23,42,0.02)] outline-none transition focus:border-[#f6b900] focus:ring-4 focus:ring-[#f6b900]/12"
                  placeholder="Enter your username"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[0.98rem] font-medium tracking-[-0.02em] text-[#202736]"
                >
                  Password
                </label>
                <div className="relative mt-3">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="h-14 w-full rounded-[1rem] border border-[#e6ddd1] bg-white px-4.5 pr-13 text-[0.98rem] text-[#202736] shadow-[0_1px_2px_rgba(15,23,42,0.02)] outline-none transition focus:border-[#f6b900] focus:ring-4 focus:ring-[#f6b900]/12"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute top-1/2 right-4 -translate-y-1/2 text-[#7a8292] transition hover:text-[#202736]"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-14 w-full items-center justify-center rounded-[1rem] bg-[#f6b900] text-[1rem] font-semibold text-white transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
