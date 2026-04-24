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
  mobileMenuOpen: boolean

  setOrganization: (id: string | null) => void
  setActiveDataset: (id: string | null) => void
  setDateRange: (start: Date, end: Date, preset?: string) => void
  clearDateRange: () => void
  setActiveThread: (id: string | null) => void
  toggleSidebar: () => void
  setMobileMenuOpen: (open: boolean) => void
  reset: () => void
}

const initialState = {
  organizationId: null,
  activeDatasetId: null,
  dateRange: { start: null, end: null },
  datePreset: null,
  activeThreadId: null,
  sidebarCollapsed: false,
  mobileMenuOpen: false,
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      ...initialState,

      setOrganization: (id) => set({ organizationId: id, activeDatasetId: null, activeThreadId: null }),
      setActiveDataset: (id) => set({ activeDatasetId: id }),
      setDateRange: (start, end, preset) => set({ dateRange: { start, end }, datePreset: preset ?? null }),
      clearDateRange: () => set({ dateRange: { start: null, end: null }, datePreset: 'all_data' }),
      setActiveThread: (id) => set({ activeThreadId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
      reset: () => set(initialState),
    }),
    {
      name: 'spokesbot-ui-prefs',
      // Persist sidebar preference and last active thread so the widget can
      // re-hydrate the previous conversation after a page refresh.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        activeThreadId: state.activeThreadId,
      }),
    },
  ),
)
