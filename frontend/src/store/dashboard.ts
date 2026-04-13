import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DateRange } from '@/types'

interface DashboardState {
  organizationId: string | null
  activeDatasetId: string | null
  dateRange: DateRange
  datePreset: string | null
  activeThreadId: string | null
  sidebarCollapsed: boolean

  setOrganization: (id: string | null) => void
  setActiveDataset: (id: string | null) => void
  setDateRange: (start: Date, end: Date, preset?: string) => void
  clearDateRange: () => void
  setActiveThread: (id: string | null) => void
  toggleSidebar: () => void
  reset: () => void
}

const initialState = {
  organizationId: null,
  activeDatasetId: null,
  dateRange: { start: null, end: null },
  datePreset: null,
  activeThreadId: null,
  sidebarCollapsed: false,
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      ...initialState,

      setOrganization: (id) => set({ organizationId: id, activeDatasetId: null, activeThreadId: null }),
      setActiveDataset: (id) => set({ activeDatasetId: id }),
      setDateRange: (start, end, preset) => set({ dateRange: { start, end }, datePreset: preset ?? null }),
      clearDateRange: () => set({ dateRange: { start: null, end: null }, datePreset: null }),
      setActiveThread: (id) => set({ activeThreadId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      reset: () => set(initialState),
    }),
    {
      name: 'spokesbot-ui-prefs',
      // Only persist the sidebar preference — all data state resets on refresh
      // so stale org/dataset IDs from a previous session don't bleed through.
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
