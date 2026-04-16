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
import { ExportButton } from '@/components/dashboard/ExportButton'
import type { AIInsight, Dataset, AnalyticsResult, InsightsResult } from '@/types'

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

// Metrics where a positive delta is BAD (higher cost / higher CPC = worse performance)
const INVERTED_TREND_KEYS = new Set(['cost', 'avg_cpc'])

type MetricCardData = {
  key: string
  label: string
  value: string
  delta: number | null
  trendDirection: 'positive' | 'negative' | 'neutral'
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
const DASHBOARD_CACHE_LIMIT = 24
const analyticsResponseCache = new Map<string, AnalyticsResult>()
const insightsResponseCache = new Map<string, InsightsResult>()

function rememberDashboardCache<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value)
  if (cache.size <= DASHBOARD_CACHE_LIMIT) return

  const oldestKey = cache.keys().next().value
  if (oldestKey) {
    cache.delete(oldestKey)
  }
}

const DATE_COLUMN_EXACT_OV = new Set(['date', 'day', 'timestamp', 'time'])

function isLikelyDateColumn(name: string) {
  const normalized = name.toLowerCase().trim()
  if (DATE_COLUMN_EXACT_OV.has(normalized)) return true
  return (
    /(^|[_\W])(date|time|day|timestamp|month|year)([_\W]|$)/i.test(normalized) ||
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

// CTR is stored as a ratio (0–1). Always multiply by 100.
// No ≤1 heuristic — it would incorrectly double-multiply values like 0.5 (0.5% → 50%).
function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
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

function getDashboardDateColumn(dataset: Dataset | null) {
  if (!dataset) return null
  return dataset.detected_date_column ?? dataset.column_headers.find(isLikelyDateColumn) ?? null
}

function buildDashboardRequestKey(params: {
  datasetId: string
  organizationScope: string
  datasetUpdatedAt: string
  dateColumn: string | null
  datePreset: string | null
  startDate: string | null
  endDate: string | null
}) {
  return [
    params.datasetId,
    params.organizationScope,
    params.datasetUpdatedAt,
    params.dateColumn ?? 'no-date-column',
    params.datePreset ?? 'all-time',
    params.startDate ?? 'no-start',
    params.endDate ?? 'no-end',
  ].join('::')
}

function MetricCard({ card }: { card: MetricCardData }) {
  const deltaText = formatDelta(card.delta)
  const isPositive = card.trendDirection === 'positive'

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
            card.trendDirection === 'neutral' ? 'text-[#98a1b2]' : isPositive ? 'text-[#24a261]' : 'text-[#ef4444]'
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

const ZOOM_STEPS = [14, 30, 60, 90, 180, 365]

function RevenueCostPanel({ data }: { data: TrendPoint[] }) {
  const [zoomIndex, setZoomIndex] = useState(2) // default: last 60 data points

  const visibleData = useMemo(() => {
    if (data.length === 0) return data
    const limit = ZOOM_STEPS[zoomIndex]
    return data.slice(-limit)
  }, [data, zoomIndex])

  return (
    <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <h3 className="text-[1.05rem] font-semibold text-[#687285]">Revenue vs Cost Trend</h3>
        {data.length > 0 && (
          <div className="flex items-center gap-1 rounded-xl border border-[#e8e1d7] bg-[#fafaf8] p-1">
            <button
              id="overview-chart-zoom-out"
              onClick={() => setZoomIndex((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7585] transition hover:bg-white hover:text-[#252b36] disabled:opacity-30"
              title="Zoom out"
            >
              <span className="text-base font-bold leading-none">−</span>
            </button>
            <span className="min-w-[46px] text-center text-[0.8rem] font-medium text-[#8a93a5]">
              {ZOOM_STEPS[zoomIndex]}d
            </span>
            <button
              id="overview-chart-zoom-in"
              onClick={() => setZoomIndex((z) => Math.max(z - 1, 0))}
              disabled={zoomIndex === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7585] transition hover:bg-white hover:text-[#252b36] disabled:opacity-30"
              title="Zoom in"
            >
              <span className="text-base font-bold leading-none">+</span>
            </button>
          </div>
        )}
      </div>
      {data.length > 0 ? (
        <div className="mt-5 h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visibleData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
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
                interval={visibleData.length > 30 ? Math.ceil(visibleData.length / 7) : visibleData.length > 14 ? Math.ceil(visibleData.length / 5) : 0}
                minTickGap={35}
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
                tickFormatter={(value) => `$${Math.round(value).toLocaleString('en-US')}`}
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
                connectNulls={true}
                dataKey="revenue"
                stroke="#f5b800"
                fill="url(#revenueFill)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                connectNulls={true}
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
              We need dated revenue and cost columns in the dataset to draw this chart.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function RevenueSplitPanel({ slices }: { slices: SplitSlice[] }) {
  // Hide panel entirely when no breakdown data — lets RevenueCostPanel take full width
  if (slices.length === 0) return null

  return (
    <div className="rounded-[1.7rem] border border-[#e8e1d7] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <h3 className="text-[1.05rem] font-semibold text-[#687285]">Revenue Distribution</h3>
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
    </div>
  )
}

const LIVE_REFRESH_MS = 30_000

export function OverviewDashboard({ targetOrgId }: { targetOrgId?: string } = {}) {
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
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const isInitialOrOrgLoadRef = useRef<string | null>(null)

  // 30-second live refresh
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), LIVE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const completedDatasets = useMemo(() => datasets.filter((dataset) => dataset.status === 'completed'), [datasets])
  const insightsEmptyMessage = useMemo(() => {
    if (loadingDatasets) return 'Loading datasets…'
    if (datasets.length === 0) return 'No datasets found. An admin needs to upload a CSV file first.'
    if (completedDatasets.length === 0) {
      const hasFailed = datasets.some((d) => d.status === 'failed')
      const hasProcessing = datasets.some((d) => d.status === 'processing' || d.status === 'queued')
      if (hasFailed) return 'Dataset processing failed. Contact your admin to re-upload the CSV file.'
      if (hasProcessing) return 'Dataset is being processed. AI insights will appear once it\'s ready.'
    }
    return 'Insights will appear once the active dataset is ready for AI analysis.'
  }, [loadingDatasets, datasets, completedDatasets])
  const activeDataset = useMemo(() => 
    completedDatasets.find((dataset) => dataset.id === activeDatasetId)
    ?? datasets.find((dataset) => dataset.id === activeDatasetId), 
  [completedDatasets, datasets, activeDatasetId])
  const activeDateColumn = useMemo(() => getDashboardDateColumn(activeDataset ?? null), [activeDataset])
  const startDateValue = useMemo(
    () => (datePreset === 'custom' && dateRange.start ? format(dateRange.start, 'yyyy-MM-dd') : null),
    [datePreset, dateRange.start],
  )
  const endDateValue = useMemo(
    () => (datePreset === 'custom' && dateRange.end ? format(dateRange.end, 'yyyy-MM-dd') : null),
    [datePreset, dateRange.end],
  )
  const organizationScope = targetOrgId
    ?? (user?.role === 'admin' ? organizationId ?? 'admin-default' : user?.organization?.id ?? 'client-org')
  const analyticsRequestKey = activeDatasetId
    ? buildDashboardRequestKey({
        datasetId: activeDatasetId,
        organizationScope,
        datasetUpdatedAt: activeDataset?.updated_at ?? 'unknown-update',
        dateColumn: activeDateColumn,
        datePreset: datePreset ?? null,
        startDate: startDateValue,
        endDate: endDateValue,
      })
    : null
  const insightsRequestKey = analyticsRequestKey ? `insights::${analyticsRequestKey}` : null

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function loadDatasets() {
      const token = session?.access_token
      if (!token) return
      setLoadingDatasets(true)
      setError(null)
      try {
        const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
        const data = await api.datasets.list(token, effectiveOrgId)
        if (cancelled) return

        const sortedData = [...data].sort(
          (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        )
        setDatasets(sortedData)

        const availableDatasets = sortedData.filter((dataset) => dataset.status === 'completed')
        const currentOrgKey = effectiveOrgId ?? 'client-org'

        if (isInitialOrOrgLoadRef.current !== currentOrgKey) {
          isInitialOrOrgLoadRef.current = currentOrgKey
          if (availableDatasets.length > 0) {
            setActiveDataset(availableDatasets[0].id)
          } else {
            setActiveDataset(null)
          }
        } else {
          const currentActiveId = useDashboardStore.getState().activeDatasetId
          if (availableDatasets.length > 0 && !availableDatasets.some((dataset) => dataset.id === currentActiveId)) {
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
  }, [session, organizationId, targetOrgId, setActiveDataset, user?.role, refreshTick])

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
      if (!token || !datasetId || !analyticsRequestKey) return

      const cached = analyticsResponseCache.get(analyticsRequestKey)
      if (cached) {
        setAnalytics(cached)
        setLastUpdated(new Date())
        setLoadingAnalytics(false)
        setError(null)
        return
      }

      setError(null)
      setLoadingAnalytics(true)
      try {
        const body: Parameters<typeof api.analytics.compute>[0] = {
          dataset_id: datasetId,
          operation: 'auto',
          ...(activeDateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? {
                  start_date: startDateValue!,
                  end_date: endDateValue!,
                  date_column: activeDateColumn,
                }
              : datePreset
                ? { date_preset: datePreset, date_column: activeDateColumn }
                : {}
            : {}),
        }

        const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
        const result = await api.analytics.compute(body, token, effectiveOrgId)

        rememberDashboardCache(analyticsResponseCache, analyticsRequestKey, result)

        if (!cancelled) { setAnalytics(result); setLastUpdated(new Date()) }
      } catch (requestError) {
        if (!cancelled) {
          const message = requestError instanceof Error && requestError.name === 'AbortError'
            ? 'Analytics are taking longer than expected. Please try again or narrow the date range.'
            : requestError instanceof Error
              ? requestError.message
              : 'Failed to load analytics'
          setError(message)
        }
      } finally {
        if (!cancelled) setLoadingAnalytics(false)
      }
    }

    void loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [
    session,
    activeDatasetId,
    analyticsRequestKey,
    datePreset,
    dateRange.start,
    dateRange.end,
    startDateValue,
    endDateValue,
    activeDateColumn,
    organizationId,
    targetOrgId,
    user?.role,
  ])

  useEffect(() => {
    if (!session || !activeDatasetId) {
      setOverallInsights([])
      setLoadingInsights(false)
      setInsightsError(null)
      return
    }

    if (loadingAnalytics) {
      setOverallInsights([])
      setInsightsError(null)
      setLoadingInsights(false)
      return
    }

    let cancelled = false

    async function loadOverallInsights() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId || !insightsRequestKey) return

      const cached = insightsResponseCache.get(insightsRequestKey)
      if (cached) {
        setOverallInsights(cached.insights)
        setLoadingInsights(false)
        setInsightsError(null)
        return
      }

      setLoadingInsights(true)
      setInsightsError(null)

      try {
        const body: Parameters<typeof api.analytics.getInsights>[0] = {
          dataset_id: datasetId,
          ...(activeDateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? {
                  start_date: startDateValue!,
                  end_date: endDateValue!,
                  date_column: activeDateColumn,
                }
              : datePreset
                ? { date_preset: datePreset, date_column: activeDateColumn }
                : {}
            : {}),
        }

        const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
        const result = await api.analytics.getInsights(body, token, effectiveOrgId)

        rememberDashboardCache(insightsResponseCache, insightsRequestKey, result)

        if (!cancelled) setOverallInsights(result.insights)
      } catch (requestError) {
        if (!cancelled) {
          setOverallInsights([])
          const message = requestError instanceof Error && requestError.name === 'AbortError'
            ? 'AI insights are taking longer than expected. The rest of the dashboard is ready.'
            : requestError instanceof Error
              ? requestError.message
              : 'Failed to load AI insights'
          setInsightsError(message)
        }
      } finally {
        if (!cancelled) setLoadingInsights(false)
      }
    }

    setOverallInsights([])
    setInsightsError(null)

    const timeoutId = window.setTimeout(() => {
      void loadOverallInsights()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    session,
    activeDatasetId,
    insightsRequestKey,
    loadingAnalytics,
    datePreset,
    dateRange.start,
    dateRange.end,
    startDateValue,
    endDateValue,
    activeDateColumn,
    organizationId,
    targetOrgId,
    user?.role,
  ])

  const activeOrganizationName = (targetOrgId ? organizations.find((org) => org.id === targetOrgId)?.name : null)
    ?? organizations.find((org) => org.id === organizationId)?.name
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

      const trendDirection: MetricCardData['trendDirection'] =
        delta == null || Math.abs(delta) < 0.05
          ? 'neutral'
          : INVERTED_TREND_KEYS.has(definition.key)
            ? delta > 0 ? 'negative' : 'positive'
            : delta > 0 ? 'positive' : 'negative'

      return {
        key: definition.key,
        label: definition.label,
        value: formatMetricValue(definition.kind, value),
        delta,
        trendDirection,
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
      // Only render the Revenue Distribution chart when we have an explicit
      // in-store/delivery breakdown. The previous fallback ("any 2–5 category
      // breakdown") could silently display unrelated dimensions (device type,
      // match type, etc.) under a "Revenue Distribution" heading.
      if (!revenueColumn || !metricBreakdowns[revenueColumn]) return [] as SplitSlice[]

      const grouped = metricBreakdowns[revenueColumn]
      const deliveryStoreBreakdown = Object.values(grouped).find((breakdown) => {
        const labels = Object.keys(breakdown).map((label) => label.toLowerCase())
        return labels.some((label) => label.includes('delivery') || label.includes('ship')) &&
          labels.some((label) => label.includes('store') || label.includes('pickup') || label.includes('walk'))
      })

      if (!deliveryStoreBreakdown) return [] as SplitSlice[]

      return Object.entries(deliveryStoreBreakdown)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([name, value]) => ({ name: titleCase(name), value }))
    })()

    return {
      shape,
      cards,
      trendData,
      revenueSplit,
    }
  }, [analytics, activeDataset])

  return (
    <div id="dashboard-pdf-content" className="min-h-full bg-[#fcfaf7]">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#e7e1d6] bg-white px-4 py-5 sm:px-6 md:px-8 md:py-6">
        <div>
          <p className="mb-1 text-[0.8rem] font-bold tracking-[0.1em] text-[#8a93a5] uppercase">
            {activeOrganizationName}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[#252b36]">Overview</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          </div>
          {lastUpdated && (
            <p className="mt-1 text-sm text-[#b0b7c5]">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {loadingDatasets ? (
            <div className="shimmer-warm h-[42px] w-[200px] rounded-[1rem] border border-[#e5dfd6]" />
          ) : (
            <select
              id="report-selector"
              value={activeDatasetId ?? ''}
              onChange={(e) => setActiveDataset(e.target.value || null)}
              disabled={completedDatasets.length === 0}
              className="h-[42px] w-[220px] appearance-none rounded-[1rem] border border-[#e5dfd6] bg-white px-4 pr-10 text-[0.95rem] font-medium text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition hover:border-[#f0a500]/50 focus:border-[#f0a500]/50"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%237c8493'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.8rem center',
                backgroundSize: '1.2rem',
                textOverflow: 'ellipsis',
              }}
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
          )}

          <DateFilter />
          <ExportButton
            contentId="dashboard-pdf-content"
            fileName={`${activeOrganizationName.replace(/\s+/g, '-')}-overview`}
            reportTitle={`${activeOrganizationName} · Overview`}
          />
        </div>
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6 md:space-y-8 md:px-8 md:py-8">

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
                    className="rounded-[1.45rem] border border-[#ebe4da] bg-white px-4 py-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="shimmer-warm h-3 w-20 rounded" />
                      <div className="shimmer-warm h-4 w-4 rounded" />
                    </div>
                    <div className="shimmer-warm mt-5 h-6 w-24 rounded" />
                    <div className="shimmer-warm mt-4 h-4 w-28 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
                {viewModel.cards.map((card) => (
                  <MetricCard key={card.key} card={card} />
                ))}
              </div>
            )}

            <div className={`grid gap-6 ${viewModel.revenueSplit.length > 0 ? 'xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.95fr)]' : 'xl:grid-cols-1'}`}>
              {loadingAnalytics ? (
                <>
                  <div className="rounded-[1.7rem] border border-[#ebe4da] bg-white p-6">
                    <div className="shimmer-warm h-5 w-48 rounded" />
                    <div className="shimmer-warm mt-6 h-[420px] rounded-[1.3rem]" />
                  </div>
                  <div className="rounded-[1.7rem] border border-[#ebe4da] bg-white p-6">
                    <div className="shimmer-warm h-5 w-32 rounded" />
                    <div className="shimmer-warm mt-10 mx-auto h-[280px] w-[280px] rounded-full" />
                    <div className="mt-6 flex justify-center gap-4">
                      {[...Array(2)].map((_, i) => <div key={i} className="shimmer-warm h-4 w-20 rounded" />)}
                    </div>
                  </div>
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
              loading={loadingInsights || (loadingDatasets && !activeDatasetId)}
              error={insightsError}
              emptyMessage={insightsEmptyMessage}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return <OverviewDashboard />
}
