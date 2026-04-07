'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!session) {
      router.replace('/login')
      return
    }
    // user is guaranteed non-null here (loading=false, session set means loadProfile ran)
    // null user (API failure) is also redirected to login for safety
    if (!user || user.role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [loading, session, user, router])

  // Show spinner until we are certain the user is an authenticated admin
  if (loading || !session || !user || user.role !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="glass-panel-strong flex size-16 items-center justify-center rounded-full">
          <div className="h-7 w-7 rounded-full border-[3px] border-emerald-400 border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
