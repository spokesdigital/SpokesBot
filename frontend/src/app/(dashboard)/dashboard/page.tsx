'use client'

import { useAuth } from '@/contexts/AuthContext'
import { ClientOverviewDashboard } from '@/components/admin/ClientOverviewDashboard'
import { useDashboardStore } from '@/store/dashboard'
import { useEffect } from 'react'

// Full-page shimmer shown while auth is hydrating so there is never a
// "No organisation" flash before the session resolves.
function PageSkeleton() {
  return (
    <div className="space-y-5 p-8 bg-[#fcfaf7] min-h-full">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-[1.4rem] border border-[#ebe4da] bg-white px-4 py-5">
            <div className="shimmer-cool h-3 w-20 rounded" />
            <div className="shimmer-cool mt-4 h-6 w-24 rounded" />
          </div>
        ))}
      </div>
      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="shimmer-cool h-[320px] rounded-[1.7rem]" />
        <div className="shimmer-cool h-[320px] rounded-[1.7rem]" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const { setOrganization } = useDashboardStore()

  const orgId = user?.organization?.id

  // Keep store in sync once org is known
  useEffect(() => {
    if (orgId) setOrganization(orgId)
  }, [orgId, setOrganization])

  // While auth is still hydrating, show a skeleton that matches the
  // ClientOverviewDashboard layout so there is zero layout shift.
  if (loading) return <PageSkeleton />

  if (!orgId) {
    return (
      <div className="flex min-h-[480px] items-center justify-center p-8 text-center bg-[#fcfaf7]">
        <p className="text-slate-500 font-medium">
          No organisation is associated with this account. Please contact your admin.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[#fcfaf7] min-h-full">
      <ClientOverviewDashboard orgId={orgId} />
    </div>
  )
}
