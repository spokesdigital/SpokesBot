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

  // Show a layout skeleton until we are certain the user is an authenticated admin.
  if (loading || !session || !user || user.role !== 'admin') {
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
    <div className="flex h-screen overflow-hidden bg-[#fcfaf7]">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
