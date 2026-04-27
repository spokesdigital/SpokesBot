'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Menu } from 'lucide-react'
import Image from 'next/image'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useAuth()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    // session exists but profile hasn't arrived yet — stay on the skeleton,
    // don't redirect prematurely.
    if (session && !user) return
    if (!session) {
      router.replace('/login')
      return
    }
    if (!user || user.role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [loading, session, user, router])

  // Only block on the very first Supabase session hydration.
  // Once loading=false and session exists, show the real layout immediately —
  // the user profile loads in the background and the redirect effect handles
  // non-admins asynchronously. Waiting for !user causes a visible shimmer after
  // every login even though the session is already confirmed.
  if (loading || !session) {
    return (
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar skeleton — mirrors AdminSidebar dimensions */}
        <div className="m-4 mr-0 flex w-56 flex-shrink-0 flex-col rounded-[1.75rem] border border-white/50 bg-white/60 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/50 px-4 py-5">
            <div className="shimmer-cool h-9 w-9 flex-shrink-0 rounded-2xl" />
            <div className="shimmer-cool h-4 flex-1 rounded-lg" />
          </div>
          <nav className="flex-1 space-y-1 p-2">
            <div className="shimmer-cool h-10 rounded-xl" />
            <div className="shimmer-cool h-10 rounded-xl opacity-70" />
          </nav>
          <div className="space-y-2 border-t border-white/50 p-4">
            <div className="shimmer-cool h-3 w-24 rounded" />
            <div className="shimmer-cool h-4 w-16 rounded" />
            <div className="shimmer-cool mt-3 h-9 rounded-xl opacity-70" />
          </div>
        </div>
        {/* Main content skeleton */}
        <main className="flex-1 space-y-4 p-6">
          <div className="shimmer-cool h-10 w-52 rounded-xl" />
          <div className="shimmer-cool h-5 w-40 rounded-lg" />
          <div className="mt-2 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[76px] items-center gap-4 rounded-[1.5rem] border border-white/50 bg-white/60 px-5"
              >
                <div className="shimmer-cool h-11 w-11 flex-shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <div className="shimmer-cool h-4 w-40 rounded" />
                  <div className="shimmer-cool h-3 w-28 rounded" />
                </div>
                <div className="shimmer-cool h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#fcfaf7] md:flex-row">
      {/* Mobile backdrop */}
      <div
        onClick={() => setMobileMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity md:hidden ${
          mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* AdminSidebar — pass mobile state via context-style prop */}
      <div className={`${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:static md:translate-x-0`}>
        <AdminSidebar onClose={() => setMobileMenuOpen(false)} />
      </div>

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:hidden">
          <div className="flex items-center gap-2.5">
            <Image src="/spokes-digital-logo.png" alt="Logo" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="text-sm font-bold tracking-tight text-slate-800">SpokesBot Admin</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
