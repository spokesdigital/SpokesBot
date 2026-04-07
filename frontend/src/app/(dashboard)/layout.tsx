'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { ChatWidget } from '@/components/dashboard/ChatWidget'
import { MessageCircleMore, X } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useAuth()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session || !user) {
      router.replace('/login')
      return
    }
    if (user.role === 'admin') {
      router.replace('/admin/clients')
    }
  }, [loading, session, user, router])

  if (loading || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="glass-panel-strong flex size-16 items-center justify-center rounded-full">
          <div className="h-7 w-7 rounded-full border-[3px] border-emerald-400 border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (!user || user.role === 'admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="glass-panel-strong flex size-16 items-center justify-center rounded-full">
          <div className="h-7 w-7 rounded-full border-[3px] border-emerald-400 border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#fcfaf7]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Floating chat button */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        aria-label={chatOpen ? 'Close chat assistant' : 'Open chat assistant'}
        className={`chat-launcher fixed right-7 bottom-7 z-20 flex h-[58px] w-[58px] items-center justify-center rounded-full border border-white/45 bg-[radial-gradient(circle_at_30%_28%,#ffe48a_0%,#f9c51b_38%,#ecab00_100%)] text-[#1f2530] transition-all duration-200 ease-out hover:brightness-105 ${
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
