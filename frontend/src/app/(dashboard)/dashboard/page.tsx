'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Database, Info } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { api } from '@/lib/api'
import { DateFilter } from '@/components/dashboard/DateFilter'
import { OverallInsights } from '@/components/dashboard/OverallInsights'
import type { AIInsight, Dataset, AnalyticsResult } from '@/types'

type NumericSummary = Record<string, Record<string, number>>
type NumericTotals = Record<string, number>
type MetricComparison = Record<string, { basis?: string; current?: number; previous?: number; delta_pct?: number | null }>
type MetricTimeSeries = Record<string, Record<string, Array<{ date: string; value: number }>>>
type MetricBreakdowns = Record<string, Record<string, Record<string, number>>>

type MetricCardDefinition = {
  key: string
  label: string
  kind: 'number' | 'percent' | 'currency' | 'ratio'
  patterns: RegExp[]
}

type MetricCardData = {
  key: string
  label: string
  value: string
  delta: number | null
}

type TrendPoint = {
  date: string
  revenue?: number
  cost?: number
}

type SplitSlice = {
  name: string
  value: number
}

const metricDefinitions: MetricCardDefinition[] = [
  {
    key: 'impressions',
    label: 'IMPRESSIONS',
    kind: 'number',
    patterns: [/impression/i, /\bimpr\b/i, /\bviews?\b/i],
  },
  {
    key: 'clicks',
    label: 'CLICKS',
    kind: 'number',
    patterns: [/\bclick/i, /\bclicks\b/i],
  },
  {
    key: 'ctr',
    label: 'CTR',
    kind: 'percent',
    patterns: [/\bctr\b/i, /click[\s_-]*through[\s_-]*rate/i],
  },
  {
    key: 'avg_cpc',
    label: 'AVG CPC',
    kind: 'currency',
    patterns: [/\bcpc\b/i, /cost[\s_-]*per[\s_-]*click/i],
  },
  {
    key: 'cost',
    label: 'COST',
    kind: 'currency',
    patterns: [/\bcost\b/i, /\bspend\b/i, /ad[\s_-]*spend/i, /\bexpense/i],
  },
  {
    key: 'revenue',
    label: 'REVENUE',
    kind: 'currency',
    patterns: [/\brevenue\b/i, /\bsales\b/i, /\bgmv\b/i, /\bincome\b/i, /\bamount\b/i],
  },
  {
    key: 'roas',
    label: 'ROAS',
    kind: 'ratio',
    patterns: [/\broas\b/i, /return[\s_-]*on[\s_-]*ad[\s_-]*spend/i],
  },
]

const splitColors = ['#f5b800', '#22c55e', '#f97316', '#64748b']

function isLikelyDateColumn(name: string) {
  const normalized = name.toLowerCase()
  return (
    /(^|[_\W])(date|time|day|month|year)([_\W]|$)/i.test(normalized) ||
    normalized.endsWith('_date') ||
    normalized.endsWith('_time') ||
    normalized.endsWith('_at') ||
    normalized === 'created_at' ||
    normalized === 'updated_at'
  )
}

function pickMetricColumn(columns: string[], patterns: RegExp[]) {
  return columns.find((column) => patterns.some((pattern) => pattern.test(column))) ?? null
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number) {
  const percentValue = Math.abs(value) <= 1 ? value * 100 : value
  return `${percentValue.toFixed(2)}%`
}

function formatRatio(value: number) {
  return `${value.toFixed(2)}x`
}

function formatMetricValue(kind: MetricCardDefinition['kind'], value: number | null) {
  if (value == null || Number.isNaN(value)) return '—'
  if (kind === 'currency') return formatCurrency(value)
  if (kind === 'percent') return formatPercent(value)
  if (kind === 'ratio') return formatRatio(value)
  return formatCompactNumber(value)
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDelta(delta: number | null) {
  if (delta == null || Number.isNaN(delta)) return null
  return `${Math.abs(delta).toFixed(1)}% vs prior`
}

function renderXAxisLabel(value: string) {
  try {
    return format(parseISO(value), 'MMM d')
  } catch {
    return value
  }
}

function MetricCard({ card }: { card: MetricCardData }) {
  const deltaText = formatDelta(card.delta)
  const isPositive = (card.delta ?? 0) >= 0

  return (
    <div className="rounded-[1.45rem] border border-[#e8e1d7] bg-white px-4 py-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <p className="text-[0.86rem] font-semibold tracking-[0.08em] text-[#768095]">{card.label}</p>
        <Info className="h-[18px] w-[18px] text-[#b0b7c5]" />
      </div>
      <p className="mt-4 text-xl font-semibold tracking-tight text-[#252b36]">{card.value}</p>
      {deltaText ? (
        <p
          className={`mt-3 flex items-center gap-1.5 text-[0.92rem] ${
            isPositive ? 'text-[#24a261]' : 'text-[#ef4444]'
          }`}
        >
          {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {deltaText}
        </p>
      ) : (
        <p className="mt-3 text-[0.92rem] text-[#98a1b2]">No prior comparison</p>
      )}
    </div>
  )
}

function RevenueCostPanel({ data }: { data: TrendPoint[] }) {
  return (
    <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <h3 className="text-[1.05rem] font-semibold text-[#687285]">Revenue vs Cost Trend</h3>
      {data.length > 0 ? (
        <div className="mt-5 h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#f5b800" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#f5b800" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="costFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#d9dee7" strokeDasharray="4 4" vertical={true} />
              <XAxis
                dataKey="date"
                tickFormatter={renderXAxisLabel}
                tick={{ fill: '#7a8292', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: '#7a8292', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(value) => String(Math.round(value))}
              />
              <Tooltip
                formatter={(value: number | string | Array<number | string>) => {
                  if (typeof value === 'number') return formatCurrency(value)
                  return value
                }}
                labelFormatter={(label) => renderXAxisLabel(String(label))}
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e8e1d7',
                  borderRadius: '18px',
                  boxShadow: '0 18px 44px rgba(15, 23, 42, 0.12)',
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#f5b800"
                fill="url(#revenueFill)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#ff6a00"
                fill="url(#costFill)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 flex h-[420px] items-center justify-center rounded-[1.3rem] border border-dashed border-[#e5ddd1] bg-[#fdfbf7] text-center text-[#8b94a5]">
          <div>
            <p className="text-[1rem] font-medium text-[#5d6678]">Trend data not available yet</p>
            <p className="mt-2 max-w-xs text-sm leading-6">
              We need dated revenue and cost columns in the dataset to draw this chart exactly like the reference.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function RevenueSplitPanel({ slices }: { slices: SplitSlice[] }) {
  return (
    <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <h3 className="text-[1.05rem] font-semibold text-[#687285]">Revenue Split</h3>
      {slices.length > 0 ? (
        <div className="mt-10 flex flex-col items-center">
          <div className="h-[280px] w-full max-w-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={72}
                  outerRadius={118}
                  paddingAngle={4}
                  startAngle={180}
                  endAngle={-180}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.name} fill={splitColors[index % splitColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | string | Array<number | string>) => {
                    if (typeof value === 'number') return formatCurrency(value)
                    return value
                  }}
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #e8e1d7',
                    borderRadius: '18px',
                    boxShadow: '0 18px 44px rgba(15, 23, 42, 0.12)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
            {slices.map((slice, index) => (
              <div key={slice.name} className="flex items-center gap-2 text-[0.95rem] text-[#657082]">
                <span
                  className="h-4 w-4 rounded-sm"
                  style={{ backgroundColor: splitColors[index % splitColors.length] }}
                />
                <span>{slice.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex h-[420px] items-center justify-center rounded-[1.3rem] border border-dashed border-[#e5ddd1] bg-[#fdfbf7] text-center text-[#8b94a5]">
          <div>
            <p className="text-[1rem] font-medium text-[#5d6678]">Revenue split is not available yet</p>
            <p className="mt-2 max-w-xs text-sm leading-6">
              We need a revenue metric plus a fulfillment or channel dimension such as In-Store and Delivery to populate this chart.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { session, organizations, user } = useAuth()
  const { organizationId, activeDatasetId, setActiveDataset, datePreset, dateRange } = useDashboardStore()

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null)
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [overallInsights, setOverallInsights] = useState<AIInsight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isInitialOrOrgLoadRef = useRef<string | null>(null)

  const completedDatasets = datasets.filter((dataset) => dataset.status === 'completed')
  const activeDataset = completedDatasets.find((dataset) => dataset.id === activeDatasetId)
    ?? datasets.find((dataset) => dataset.id === activeDatasetId)

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function loadDatasets() {
      const token = session?.access_token
      if (!token) return
      setLoadingDatasets(true)
      setError(null)
      try {
        const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
        const data = await api.datasets.list(token, targetOrgId)
        if (cancelled) return

        const sortedData = [...data].sort(
          (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        )
        setDatasets(sortedData)

        const availableDatasets = sortedData.filter((dataset) => dataset.status === 'completed')
        const currentOrgKey = targetOrgId ?? 'client-org'

        if (isInitialOrOrgLoadRef.current !== currentOrgKey) {
          isInitialOrOrgLoadRef.current = currentOrgKey
          if (availableDatasets.length > 0) {
            setActiveDataset(availableDatasets[0].id)
          } else {
            setActiveDataset(null)
          }
        } else {
          if (availableDatasets.length > 0 && !availableDatasets.some((dataset) => dataset.id === activeDatasetId)) {
            setActiveDataset(availableDatasets[0].id)
          } else if (availableDatasets.length === 0) {
            setActiveDataset(null)
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load datasets')
        }
      } finally {
        if (!cancelled) setLoadingDatasets(false)
      }
    }

    void loadDatasets()

    return () => {
      cancelled = true
    }
  }, [session, activeDatasetId, organizationId, setActiveDataset, user?.role])

  useEffect(() => {
    if (!session || !activeDatasetId) {
      setAnalytics(null)
      setLoadingAnalytics(false)
      return
    }
    let cancelled = false

    async function loadAnalytics() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId) return
      setError(null)
      setLoadingAnalytics(true)
      try {
        const dateColumn = activeDataset?.detected_date_column
          ?? activeDataset?.column_headers?.find(isLikelyDateColumn)
        const body: Parameters<typeof api.analytics.compute>[0] = {
          dataset_id: datasetId,
          operation: 'auto',
          ...(dateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? {
                  start_date: format(dateRange.start, 'yyyy-MM-dd'),
                  end_date: format(dateRange.end, 'yyyy-MM-dd'),
                  date_column: dateColumn,
                }
              : datePreset
                ? { date_preset: datePreset, date_column: dateColumn }
                : {}
            : {}),
        }

        const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
        const result = await api.analytics.compute(body, token, targetOrgId)

        if (!cancelled) setAnalytics(result)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) setLoadingAnalytics(false)
      }
    }

    void loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [session, activeDatasetId, datePreset, dateRange.start, dateRange.end, activeDataset, organizationId, user?.role])

  useEffect(() => {
    if (!session || !activeDatasetId) {
      setOverallInsights([])
      setLoadingInsights(false)
      setInsightsError(null)
      return
    }

    let cancelled = false

    async function loadOverallInsights() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId) return

      setLoadingInsights(true)
      setInsightsError(null)

      try {
        const dateColumn = activeDataset?.detected_date_column
          ?? activeDataset?.column_headers?.find(isLikelyDateColumn)
        const body: Parameters<typeof api.analytics.getInsights>[0] = {
          dataset_id: datasetId,
          ...(dateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? {
                  start_date: format(dateRange.start, 'yyyy-MM-dd'),
                  end_date: format(dateRange.end, 'yyyy-MM-dd'),
                  date_column: dateColumn,
                }
              : datePreset
                ? { date_preset: datePreset, date_column: dateColumn }
                : {}
            : {}),
        }

        const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
        const result = await api.analytics.getInsights(body, token, targetOrgId)

        if (!cancelled) setOverallInsights(result.insights)
      } catch (requestError) {
        if (!cancelled) {
          setOverallInsights([])
          setInsightsError(requestError instanceof Error ? requestError.message : 'Failed to load AI insights')
        }
      } finally {
        if (!cancelled) setLoadingInsights(false)
      }
    }

    void loadOverallInsights()

    return () => {
      cancelled = true
    }
  }, [session, activeDatasetId, datePreset, dateRange.start, dateRange.end, activeDataset, organizationId, user?.role])

  const activeOrganizationName = organizations.find((org) => org.id === organizationId)?.name
    ?? user?.organization?.name
    ?? 'Client Overview'

  const viewModel = useMemo(() => {
    const result = (analytics?.result ?? {}) as Record<string, unknown>
    const shape = (result.shape ?? null) as { rows: number; cols: number } | null
    const numericSummary = (result.numeric_summary ?? {}) as NumericSummary
    const numericTotals = (result.numeric_totals ?? {}) as NumericTotals
    const comparison = (result.comparison ?? {}) as MetricComparison
    const metricTimeSeries = (result.metric_time_series ?? {}) as MetricTimeSeries
    const metricBreakdowns = (result.metric_breakdowns ?? {}) as MetricBreakdowns

    const numericColumns = Object.keys(numericSummary)
    const storedMetricMappings = activeDataset?.metric_mappings ?? {}
    const metricColumns = Object.fromEntries(
      metricDefinitions.map((definition) => [
        definition.key,
        storedMetricMappings[definition.key] ?? pickMetricColumn(numericColumns, definition.patterns),
      ]),
    ) as Record<string, string | null>

    const cards: MetricCardData[] = metricDefinitions.map((definition) => {
      const column = metricColumns[definition.key]
      let value: number | null = null
      let delta: number | null = null

      const getMetricValues = (key: string) => {
        const col = metricColumns[key]
        if (!col) return { current: null, previous: null }
        return {
          current: comparison[col]?.current ?? numericTotals[col] ?? null,
          previous: comparison[col]?.previous ?? null,
        }
      }

      // Hardcode mathematical soundness for derived metrics
      const isDerived = ['ctr', 'avg_cpc', 'roas'].includes(definition.key)

      if (column && !isDerived) {
        if (definition.kind === 'percent' || definition.kind === 'ratio') {
          value = comparison[column]?.current ?? numericSummary[column]?.mean ?? null
        } else {
          value = comparison[column]?.current ?? numericTotals[column] ?? null
        }
        delta = comparison[column]?.delta_pct ?? null
      } else if (isDerived) {
        // Derive perfectly from aggregate bases (Prevents Simpson's Paradox and missing CSV columns)
        let currNum: number | null = null
        let currDen: number | null = null
        let prevNum: number | null = null
        let prevDen: number | null = null

        if (definition.key === 'ctr') {
          const c = getMetricValues('clicks')
          const i = getMetricValues('impressions')
          currNum = c.current; currDen = i.current
          prevNum = c.previous; prevDen = i.previous
        } else if (definition.key === 'avg_cpc') {
          const co = getMetricValues('cost')
          const c = getMetricValues('clicks')
          currNum = co.current; currDen = c.current
          prevNum = co.previous; prevDen = c.previous
        } else if (definition.key === 'roas') {
          const r = getMetricValues('revenue')
          const co = getMetricValues('cost')
          currNum = r.current; currDen = co.current
          prevNum = r.previous; prevDen = co.previous
        }

        if (currNum != null && currDen != null && currDen > 0) {
          value = currNum / currDen
        }
        
        if (prevNum != null && prevDen != null && prevDen > 0) {
          const prevValue = prevNum / prevDen
          if (prevValue !== 0 && value != null) {
            delta = ((value - prevValue) / Math.abs(prevValue)) * 100
          }
        }
      }

      return {
        key: definition.key,
        label: definition.label,
        value: formatMetricValue(definition.kind, value),
        delta,
      }
    })

    const revenueColumn = metricColumns.revenue
    const costColumn = metricColumns.cost
    const firstDateKey = (
      activeDataset?.detected_date_column && metricTimeSeries[activeDataset.detected_date_column]
        ? activeDataset.detected_date_column
        : Object.keys(metricTimeSeries)[0]
    )
    const trendMap = new Map<string, TrendPoint>()

    if (firstDateKey) {
      const seriesGroup = metricTimeSeries[firstDateKey] ?? {}
      const revenueSeries = revenueColumn ? (seriesGroup[revenueColumn] ?? []) : []
      const costSeries = costColumn ? (seriesGroup[costColumn] ?? []) : []

      revenueSeries.forEach((point) => {
        trendMap.set(point.date, { ...(trendMap.get(point.date) ?? { date: point.date }), revenue: point.value })
      })
      costSeries.forEach((point) => {
        trendMap.set(point.date, { ...(trendMap.get(point.date) ?? { date: point.date }), cost: point.value })
      })
    }

    const trendData = Array.from(trendMap.values()).sort((left, right) => left.date.localeCompare(right.date))

    const revenueSplit = (() => {
      if (revenueColumn && metricBreakdowns[revenueColumn]) {
        const grouped = metricBreakdowns[revenueColumn]
        const deliveryStoreBreakdown = Object.values(grouped).find((breakdown) => {
          const labels = Object.keys(breakdown).map((label) => label.toLowerCase())
          return labels.some((label) => label.includes('delivery')) &&
            labels.some((label) => label.includes('store') || label.includes('pickup'))
        })

        const selected = deliveryStoreBreakdown
          ?? Object.values(grouped).find((breakdown) => Object.keys(breakdown).length >= 2 && Object.keys(breakdown).length <= 5)

        if (!selected) return []

        return Object.entries(selected)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 4)
          .map(([name, value]) => ({ name: titleCase(name), value }))
      }

      return [] as SplitSlice[]
    })()

    return {
      shape,
      cards,
      trendData,
      revenueSplit,
    }
  }, [analytics, activeDataset])

  return (
    <div className="min-h-full bg-[#fcfaf7]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7e1d6] bg-white px-8 py-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[#252b36]">
          {activeOrganizationName}
        </h1>
        <DateFilter />
      </header>

      <div className="space-y-8 px-8 py-8">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-4xl font-semibold tracking-tight text-[#252b36]">Overview</h2>
              <p className="mt-2 text-base text-[#727b8d]">
                Performance for the selected uploaded report
              </p>
            </div>

            <div className="min-w-[260px] rounded-[1.35rem] border border-[#e8e1d7] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <label htmlFor="report-selector" className="text-xs font-semibold tracking-[0.12em] text-[#8a93a5]">
                REPORT
              </label>
              <select
                id="report-selector"
                value={activeDatasetId ?? ''}
                onChange={(e) => setActiveDataset(e.target.value || null)}
                disabled={loadingDatasets || completedDatasets.length === 0}
                className="mt-2 w-full bg-transparent text-sm font-medium text-[#252b36] outline-none"
              >
                {completedDatasets.length === 0 ? (
                  <option value="">No reports available</option>
                ) : (
                  completedDatasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.report_name || dataset.file_name}
                    </option>
                  ))
                )}
              </select>
              {activeDataset && (
                <p className="mt-2 text-xs text-[#8d95a5]">
                  Uploaded {format(parseISO(activeDataset.uploaded_at), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {activeDataset && activeDataset.ingestion_warnings.length > 0 && (
          <div className="flex items-start gap-3 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" />
            <span>{activeDataset.ingestion_warnings.join(' ')}</span>
          </div>
        )}

        {!loadingDatasets && completedDatasets.length === 0 ? (
          <div className="flex min-h-[440px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#e5ddd1] bg-white text-center shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <Database className="h-12 w-12 text-[#c0c7d4]" />
            <p className="mt-5 text-[1.1rem] font-semibold text-[#2a303b]">No reports yet</p>
            <p className="mt-2 max-w-md text-[0.96rem] leading-7 text-[#778094]">
              We are currently preparing your workspace. Your dedicated admin will upload your reporting datasets shortly.
            </p>
          </div>
        ) : (
          <>
            {loadingAnalytics ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[170px] animate-pulse rounded-[1.45rem] border border-[#ebe4da] bg-white"
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
                {viewModel.cards.map((card) => (
                  <MetricCard key={card.key} card={card} />
                ))}
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.95fr)]">
              {loadingAnalytics ? (
                <>
                  <div className="h-[500px] animate-pulse rounded-[1.7rem] border border-[#ebe4da] bg-white" />
                  <div className="h-[500px] animate-pulse rounded-[1.7rem] border border-[#ebe4da] bg-white" />
                </>
              ) : (
                <>
                  <RevenueCostPanel data={viewModel.trendData} />
                  <RevenueSplitPanel slices={viewModel.revenueSplit} />
                </>
              )}
            </div>

            {activeDataset && (
              <p className="text-sm text-[#8d95a5]">
                Report: <span className="font-medium text-[#5b6475]">{activeDataset.report_name || activeDataset.file_name}</span>
                {activeDataset.report_name && activeDataset.report_name !== activeDataset.file_name ? (
                  <span>{` • Source file: ${activeDataset.file_name}`}</span>
                ) : null}
                {viewModel.shape ? ` • ${viewModel.shape.rows.toLocaleString()} rows` : ''}
              </p>
            )}

            <OverallInsights
              insights={overallInsights}
              loading={loadingInsights}
              error={insightsError}
            />
          </>
        )}
      </div>
    </div>
  )
}
