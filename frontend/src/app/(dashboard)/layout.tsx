'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { ChatWidget } from '@/components/dashboard/ChatWidget'
import { MessageCircleMore, X, Menu } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboard'
import Image from 'next/image'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useAuth()
  const router = useRouter()
  const { setMobileMenuOpen } = useDashboardStore()
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    // session exists but profile hasn't arrived yet — stay on the skeleton,
    // don't redirect to /login prematurely.
    if (session && !user) return
    if (!session || !user) {
      router.replace('/login')
      return
    }
    if (user.role === 'admin') {
      router.replace('/admin/clients')
    }
  }, [loading, session, user, router])

  if (loading || !session || !user || user.role === 'admin') {
    return (
      <div className="flex h-screen overflow-hidden bg-[#fcfaf7]">
        {/* Sidebar skeleton */}
        <div className="flex w-64 flex-shrink-0 flex-col bg-[#1d2129]">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-5">
            <div className="shimmer-dark h-[42px] w-[42px] flex-shrink-0 rounded-xl" />
            <div className="shimmer-dark h-5 flex-1 rounded-lg" />
            <div className="shimmer-dark h-10 w-10 rounded-xl" />
          </div>
          <nav className="flex-1 space-y-2 px-3 py-6">
            <div className="shimmer-dark h-14 rounded-[1.15rem]" />
            <div className="shimmer-dark h-14 rounded-[1.15rem] opacity-70" />
          </nav>
          <div className="border-t border-white/8 px-6 py-7">
            <div className="shimmer-dark mb-2 h-3 w-12 rounded" />
            <div className="shimmer-dark h-5 w-36 rounded" />
            <div className="shimmer-dark mt-10 h-10 rounded-xl opacity-60" />
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e7e1d6] bg-white px-8 py-6">
            <div className="shimmer-warm h-9 w-52 rounded-xl" />
            <div className="shimmer-warm h-9 w-36 rounded-xl" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-8 px-8 py-8">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="shimmer-warm h-10 w-40 rounded-xl" />
                <div className="shimmer-warm h-5 w-64 rounded-lg" />
              </div>
              <div className="shimmer-warm h-[72px] w-[260px] rounded-[1.35rem] border border-[#e8e1d7]" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="shimmer-warm h-[170px] rounded-[1.45rem] border border-[#ebe4da]" />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.95fr)]">
              <div className="shimmer-warm h-[500px] rounded-[1.7rem] border border-[#ebe4da]" />
              <div className="shimmer-warm h-[500px] rounded-[1.7rem] border border-[#ebe4da]" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#fcfaf7] md:flex-row">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b border-[#e7e1d6] bg-white px-5 md:hidden">
          <div className="flex items-center gap-2.5">
            <Image
              src="/spokes-digital-logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
            <span className="text-[0.95rem] font-bold tracking-tight text-[#1d2129]">
              Spokes Digital
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Floating chat button */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        aria-label={chatOpen ? 'Close chat assistant' : 'Open chat assistant'}
        className={`chat-launcher chat-fab-bottom fixed right-5 sm:right-7 z-20 flex h-[58px] w-[58px] items-center justify-center rounded-full border border-white/45 bg-[radial-gradient(circle_at_30%_28%,#ffe48a_0%,#f9c51b_38%,#ecab00_100%)] text-[#1f2530] transition-all duration-200 ease-out hover:brightness-105 ${
          chatOpen
            ? 'scale-105 shadow-[0_24px_44px_rgba(245,184,0,0.4)]'
            : 'chat-launcher-idle scale-100'
        }`}
      >
        <span className="pointer-events-none absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_28%_26%,rgba(255,255,255,0.72),rgba(255,255,255,0.12)_34%,transparent_52%)]" />
        <span className="pointer-events-none absolute -inset-3 rounded-full bg-[radial-gradient(circle,rgba(255,211,84,0.28)_0%,rgba(255,211,84,0.12)_42%,transparent_72%)] opacity-90 blur-md" />
        <span className="relative block h-8 w-8">
          <MessageCircleMore
            className={`absolute inset-0 h-8 w-8 transition-all duration-200 ease-out ${
              chatOpen ? 'scale-75 rotate-[-90deg] opacity-0' : 'scale-100 rotate-0 opacity-100'
            }`}
          />
          <X
            className={`absolute inset-0 h-8 w-8 transition-all duration-200 ease-out ${
              chatOpen ? 'scale-100 rotate-0 opacity-100' : 'scale-75 rotate-90 opacity-0'
            }`}
          />
        </span>
      </button>

      {/* Floating chat widget overlay */}
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
