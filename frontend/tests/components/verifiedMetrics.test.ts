import {
  getAnalyticsDataQualityWarnings,
  getVerifiedMetricColumn,
  getVerifiedMetricColumns,
} from '@/components/dashboard/verifiedMetrics'

describe('verifiedMetrics', () => {
  it('only returns metric mappings that are present in the analytics payload', () => {
    expect(
      getVerifiedMetricColumn('revenue', { revenue: 'Revenue' }, ['Revenue', 'Cost']),
    ).toBe('Revenue')

    expect(
      getVerifiedMetricColumn('revenue', { revenue: 'Revenue' }, ['Cost']),
    ).toBeNull()
  })

  it('builds a strict metric map without falling back to heuristics', () => {
    expect(
      getVerifiedMetricColumns(
        [{ key: 'clicks' }, { key: 'revenue' }],
        { clicks: 'Clicks', revenue: 'Revenue' },
        ['Clicks'],
      ),
    ).toEqual({
      clicks: 'Clicks',
      revenue: null,
    })
  })

  it('extracts only string data-quality warnings from analytics results', () => {
    expect(
      getAnalyticsDataQualityWarnings({
        data_quality_warnings: ['Column Cost could not be parsed.', 123, '', 'Revenue excluded bad rows.'],
      }),
    ).toEqual(['Column Cost could not be parsed.', 'Revenue excluded bad rows.'])
  })
})
