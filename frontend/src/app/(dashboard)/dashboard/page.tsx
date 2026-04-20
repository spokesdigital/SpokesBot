'use client'

import { useAuth } from '@/contexts/AuthContext'
import { ClientOverviewDashboard } from '@/components/admin/ClientOverviewDashboard'
import { useDashboardStore } from '@/store/dashboard'
import { useEffect } from 'react'

export default function DashboardPage() {
  const { user } = useAuth()
  const { setOrganizationId } = useDashboardStore()
  
  const orgId = user?.organization?.id

  // Ensure store is synced with the user's org id for other components
  useEffect(() => {
    if (orgId) {
      setOrganizationId(orgId)
    }
  }, [orgId, setOrganizationId])

  if (!orgId) {
    return (
      <div className="flex min-h-[480px] items-center justify-center p-8 text-center bg-[#fcfaf7]">
        <p className="text-slate-500 font-medium">No organization associated with this account.</p>
      </div>
    )
  }

  return (
    <div className="bg-[#fcfaf7] min-h-full">
      <ClientOverviewDashboard orgId={orgId} />
    </div>
  )
}
