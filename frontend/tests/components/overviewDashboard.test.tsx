import { render, waitFor } from '@testing-library/react'
import { ClientOverviewDashboard } from '@/components/admin/ClientOverviewDashboard'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/store/dashboard', () => ({
  useDashboardStore: jest.fn(),
}))

jest.mock('@/lib/api', () => ({
  api: {
    datasets: {
      list: jest.fn(),
    },
    analytics: {
      compute: jest.fn(),
      getInsights: jest.fn(),
    },
  },
}))

jest.mock('@/components/dashboard/DateFilter', () => ({
  DateFilter: () => <div>DateFilter</div>,
}))

jest.mock('@/components/dashboard/OverallInsights', () => ({
  OverallInsights: () => <div>OverallInsights</div>,
}))

describe('OverviewDashboard', () => {
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
  const mockUseDashboardStore = useDashboardStore as unknown as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    mockUseAuth.mockReturnValue({
      session: { access_token: 'token' },
      organizations: [],
      user: {
        id: 'user-1',
        email: 'client@test.com',
        role: 'admin',
        organization: { id: 'org-1', name: 'Org 1', created_at: '2026-04-01T00:00:00Z' },
      },
    })

    mockUseDashboardStore.mockReturnValue({
      datasets: [],
      datasetsLoaded: false,
      datasetsOrgId: null,
      setDatasets: jest.fn(),
    })

    ;(api.datasets.list as jest.Mock).mockResolvedValue([])
    ;(api.analytics.compute as jest.Mock).mockResolvedValue({ dataset_id: 'dataset-1', operation: 'auto', result: {} })
    ;(api.analytics.getInsights as jest.Mock).mockResolvedValue({ dataset_id: 'dataset-1', insights: [] })
  })

  it('requests datasets for the overview dashboard organization', async () => {
    render(<ClientOverviewDashboard orgId="org-1" />)

    await waitFor(() => {
      expect(api.datasets.list).toHaveBeenCalledWith('token', 'org-1')
    })
  })
})
