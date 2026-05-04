'use client'

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
// (date-fns format used for start/end date value computation)
import { AlertCircle, ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { EmptyDashboardState } from '@/components/dashboard/EmptyDashboardState'
import { TimeoutScreen } from '@/components/dashboard/TimeoutScreen'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { useShallow } from 'zustand/react/shallow'
import { api } from '@/lib/api'
import { DateFilter } from '@/components/dashboard/DateFilter'
import { OverallInsights } from '@/components/dashboard/OverallInsights'
import { KPICard } from '@/components/dashboard/KPICard'
import dynamic from 'next/dynamic'

const ChartCard = dynamic(
  () => import('@/components/dashboard/ChannelChart').then(m => ({ default: m.ChartCard })),
  { ssr: false, loading: () => <div className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow" /> },
)
const DualAxisComboChart = dynamic(
  () => import('@/components/dashboard/ChannelChart').then(m => ({ default: m.DualAxisComboChart })),
  { ssr: false },
)
const AreaTrendChart = dynamic(
  () => import('@/components/dashboard/ChannelChart').then(m => ({ default: m.AreaTrendChart })),
  { ssr: false },
)
const DistributionChart = dynamic(
  () => import('@/components/dashboard/ChannelChart').then(m => ({ default: m.DistributionChart })),
  { ssr: false },
)
import { splitInsightsBySection } from '@/components/dashboard/channelInsights'
import {
  buildClicksCpcData,
  buildClicksCtrData,
  buildConversionRateData,
  buildNoDataLabel,
  buildPriorLabel,
  buildRevenueCostTrendData,
  buildRoasData,
  buildTransactionsCpaData,
  hasConversionRateData,
  hasTransactionsOrCpaData,
  pickConversionsColumn,
} from '@/components/dashboard/channelMetrics'
import type { ComparisonWindow } from '@/components/dashboard/channelMetrics'
import {
  getAnalyticsDataQualityWarnings,
  getVerifiedMetricColumns,
} from '@/components/dashboard/verifiedMetrics'
import type { AIInsight, Dataset, AnalyticsResult, InsightsResult } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  tooltip: string
}

// Metrics where a positive delta is BAD (higher cost / higher CPC = worse performance)
const INVERTED_TREND_KEYS = new Set(['cost', 'avg_cpc', 'cpa', 'cpm'])

type MetricCardData = {
  key: string
  label: string
  value: string
  delta: number | null
  trendDirection: 'positive' | 'negative' | 'neutral'
  priorLabel: string
  noDataLabel: string
  comparisonAttempted: boolean
  tooltip: string
}



type RevenueSplitDatum = {
  name: string
  value: number
  color: string
}

type CampaignRow = {
  name: string
  impressions: number | null
  clicks: number | null
  cost: number | null
  revenue: number | null
  conversions: number | null
  /** Ratio 0–1. fmtPct multiplies by 100 for display. */
  ctr: number | null
  cpc: number | null
  roas: number | null
  atv: number | null
}

type DailyRow = {
  date: string
  impressions: number | null
  clicks: number | null
  cost: number | null
  revenue: number | null
  conversions: number | null
  /** Ratio 0–1. fmtPct multiplies by 100 for display. */
  ctr: number | null
  cpc: number | null
  roas: number | null
  atv: number | null
}

// ─── Metric definitions (same KPIs for both channels) ────────────────────────

const metricDefinitions: MetricCardDefinition[] = [
  {
    key: 'impressions',
    label: 'IMPRESSIONS',
    kind: 'number',
    patterns: [/impression/i, /\bimpr\b/i, /\bviews?\b/i, /\breach\b/i],
    tooltip: 'Times your ads were shown.',
  },
  {
    key: 'clicks',
    label: 'CLICKS',
    kind: 'number',
    patterns: [/\bclick/i, /\bclicks\b/i, /\blink[\s_-]*click/i],
    tooltip: 'Number of ad clicks.',
  },
  {
    key: 'ctr',
    label: 'CTR',
    kind: 'percent',
    patterns: [/\bctr\b/i, /click[\s_-]*through[\s_-]*rate/i],
    tooltip: 'Percentage of views that became clicks.',
  },
  {
    key: 'avg_cpc',
    label: 'AVG CPC',
    kind: 'currency',
    patterns: [/\bcpc\b/i, /cost[\s_-]*per[\s_-]*click/i],
    tooltip: 'Average cost per click.',
  },
  {
    key: 'conversions',
    label: 'TOTAL TRANSACTIONS',
    kind: 'number',
    patterns: [/\bconversions?\b/i, /\btransactions?\b/i, /\borders?\b/i, /\bpurchases?\b/i],
    tooltip: 'Total number of transactions.',
  },
  {
    key: 'cpa',
    label: 'AVG CPT',
    kind: 'currency',
    patterns: [/\bcpa\b/i, /cost[\s_-]*per[\s_-]*action/i, /cost[\s_-]*per[\s_-]*conversion/i],
    tooltip: 'Average cost per transaction.',
  },
  {
    key: 'conversion_rate',
    label: 'TRANSACTION RATE',
    kind: 'percent',
    patterns: [/\bconversion[\s_-]*rate\b/i, /\bcvr\b/i],
    tooltip: 'Percentage of clicks that became transactions.',
  },
  {
    key: 'revenue',
    label: 'TOTAL REVENUE',
    kind: 'currency',
    patterns: [/\brevenue\b/i, /\bsales\b/i, /\bgmv\b/i, /\bpurchase[\s_-]*value/i, /\bconversion[\s_-]*value/i],
    tooltip: 'Revenue from ad-driven customers.',
  },
  {
    key: 'cost',
    label: 'COST',
    kind: 'currency',
    patterns: [/\bcost\b/i, /\bspend\b/i, /ad[\s_-]*spend/i, /amount[\s_-]*spent/i],
    tooltip: 'Total ad spend this period.',
  },
  {
    key: 'roas',
    label: 'ROAS',
    kind: 'ratio',
    patterns: [/\broas\b/i, /return[\s_-]*on[\s_-]*ad[\s_-]*spend/i],
    tooltip: 'Revenue earned per $1 of ad spend.',
  },
  {
    key: 'aov',
    label: 'AOV',
    kind: 'currency',
    patterns: [/\baov\b/i, /average[\s_-]*order[\s_-]*value/i],
    tooltip: 'Average revenue per transaction.',
  },
]

// Campaign dimension detection — ordered from broadest to most granular.
// Used by the auto-picker AND for labelling the dimension selector dropdown.
const CAMPAIGN_DIM_LEVELS: { label: string; pattern: RegExp; priority: number }[] = [
  { label: 'Campaign', pattern: /^campaign(\s+name)?$/i, priority: 0 },
  { label: 'Campaign', pattern: /campaign/i, priority: 1 },
  { label: 'Ad Group', pattern: /ad[\s_-]*group|adgroup/i, priority: 2 },
  { label: 'Ad Set', pattern: /ad[\s_-]*set|adset/i, priority: 3 },
  { label: 'Ad', pattern: /ad[\s_-]*name|ad\s*title/i, priority: 4 },
]

// Legacy flat patterns used in a few places that just need a boolean test.
const CAMPAIGN_PATTERNS = CAMPAIGN_DIM_LEVELS.map((l) => l.pattern)

function scoreCampaignDimension(col: string): number {
  for (const { pattern, priority } of CAMPAIGN_DIM_LEVELS) {
    if (pattern.test(col)) return priority
  }
  return 99
}

function labelForDimension(col: string): string {
  for (const { pattern, label } of CAMPAIGN_DIM_LEVELS) {
    if (pattern.test(col)) return label
  }
  return col
}

type SortState = { key: string; dir: 'asc' | 'desc' }

function toggleSort(current: SortState, key: string): SortState {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: 'desc' }
}

function applySortToRows<T extends Record<string, unknown>>(rows: T[], sort: SortState): T[] {
  return [...rows].sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    const sentinel = sort.dir === 'asc' ? Infinity : -Infinity
    const an = (av as number | null) ?? sentinel
    const bn = (bv as number | null) ?? sentinel
    return sort.dir === 'asc' ? an - bn : bn - an
  })
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_LIMIT = 24
const analyticsCache = new Map<string, AnalyticsResult>()
const insightsCache = new Map<string, InsightsResult>()

function setCache<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Exact bare column names accepted per spec (case-insensitive)
const DATE_COLUMN_EXACT = new Set(['date', 'day', 'timestamp', 'time'])

function isLikelyDateColumn(name: string) {
  const n = name.toLowerCase().trim()
  if (DATE_COLUMN_EXACT.has(n)) return true
  return /(^|[_\W])(date|time|day|timestamp|month|year)([_\W]|$)/i.test(n) ||
    n.endsWith('_date') || n.endsWith('_time') || n.endsWith('_at') ||
    n === 'created_at' || n === 'updated_at'
}

// Module-level Intl instances — constructed once, reused on every formatter call
const _intlN = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const _intlCur = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function formatCompactNumber(value: number) {
  return _intlN.format(value)
}

function formatCurrency(value: number) {
  return _intlCur.format(value)
}

// CTR is always stored as a ratio (0–1). Multiply unconditionally — no ≤1 heuristic
// that would silently double-multiply values like 0.5 (0.5% CTR → 50% wrong).
function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatRatio(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

// Stable formatter references for memoized chart props — defined at module level
// so they have a fixed identity across ChannelPage renders (inline arrows would break React.memo).
const fmtCtrRight = (v: number) => `${v.toFixed(1)}%`
const fmtCtrTooltip = (v: number, n: string): [string, string] =>
  n === 'CTR %' ? [`${v.toFixed(2)}%`, n] : [formatCompactNumber(v), n]
const fmtCpcRight = (v: number) => `$${v.toFixed(2)}`
const fmtCpcTooltip = (v: number, n: string): [string, string] =>
  n === 'Avg CPC $' ? [formatCurrency(v), n] : [formatCompactNumber(v), n]
const fmtCpaRight = (v: number) => `$${v.toFixed(0)}`
const fmtCpaTooltip = (v: number, n: string): [string, string] =>
  n === 'CPA $' ? [formatCurrency(v), n] : [formatCompactNumber(v), n]
const fmtConvRateTick = (v: number) => `${v.toFixed(0)}%`
const fmtConvRateTooltip = (v: number, n: string): [string, string] => [`${v.toFixed(2)}%`, n]
const fmtRevenueCostTooltip = (v: number, n: string): [string, string] => [formatCurrency(v), n]
const fmtRevenueTick = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v)}`
}
const fmtRoasTick = (v: number) => `${(v * 100).toFixed(0)}%`
const fmtRoasTooltip = (v: number, n: string): [string, string] => [`${(v * 100).toFixed(1)}%`, n]

function formatMetricValue(kind: MetricCardDefinition['kind'], value: number | null) {
  if (value == null || Number.isNaN(value)) return '—'
  if (kind === 'currency') return formatCurrency(value)
  if (kind === 'percent') return formatPercent(value)
  if (kind === 'ratio') return formatRatio(value)
  return formatCompactNumber(value)
}

// ─── Table cell formatters ────────────────────────────────────────────────────

function fmtN(v: number | null) {
  if (v == null || v === 0) return '—'
  return _intlN.format(v)
}
function fmtCur(v: number | null) {
  if (v == null || v === 0) return '—'
  return _intlCur.format(v)
}
// Table CTR values are stored as ratios (0–1). Always multiply by 100.
function fmtPct(v: number | null) {
  if (v == null || v === 0) return '—'
  return `${(v * 100).toFixed(2)}%`
}
function fmtRoasPercent(v: number | null) {
  if (v == null || v === 0) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function getDashboardDateColumn(dataset: Dataset | null) {
  if (!dataset) return null
  return dataset.detected_date_column ?? dataset.column_headers.find(isLikelyDateColumn) ?? null
}

function buildCacheKey(params: {
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

// ─── ChannelPage component ────────────────────────────────────────────────────

interface ChannelPageProps {
  reportType: 'google_ads' | 'meta_ads'
  channelName: string
  accentColor: string      // e.g. '#4285f4' for Google, '#1877f2' for Meta
  accentLight: string      // e.g. '#e8f0fe' for badge bg
  accentText: string       // e.g. '#1a56a7' for badge text
  /** When set (admin impersonation), all API calls are scoped to this org. */
  targetOrgId?: string
}

const LIVE_REFRESH_MS = 30_000

export function ChannelPage({ reportType, channelName, accentColor, accentLight: _accentLight, accentText: _accentText, targetOrgId }: ChannelPageProps) {
  void _accentLight
  void _accentText
  const { session, user } = useAuth()
  const { organizationId, datePreset, dateRange, setActiveDataset, globalDatasets, globalDatasetsLoaded, datasetsOrgId, setGlobalDatasets } = useDashboardStore(
    useShallow((s) => ({
      organizationId: s.organizationId,
      datePreset: s.datePreset,
      dateRange: s.dateRange,
      setActiveDataset: s.setActiveDataset,
      globalDatasets: s.datasets,
      globalDatasetsLoaded: s.datasetsLoaded,
      datasetsOrgId: s.datasetsOrgId,
      setGlobalDatasets: s.setDatasets,
    })),
  )

  const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
  const isCorrectOrg = datasetsOrgId === (effectiveOrgId ?? null)
  const hasPendingDatasets = isCorrectOrg && globalDatasetsLoaded
    ? globalDatasets.some((dataset) => dataset.status !== 'completed')
    : false
  const shouldRefreshDatasets = !isCorrectOrg || !globalDatasetsLoaded || hasPendingDatasets
  
  // Filter global datasets for this channel's report type
  const datasets = useMemo(() => {
    if (!isCorrectOrg || !globalDatasetsLoaded) return []
    return globalDatasets.filter(d => d.report_type === reportType)
  }, [isCorrectOrg, globalDatasetsLoaded, globalDatasets, reportType])

  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null)
  const [loadingDatasets, setLoadingDatasets] = useState(datasets.length === 0)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [insightsRetryTick, setInsightsRetryTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isTimeoutError, setIsTimeoutError] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedCampaignDimension, setSelectedCampaignDimension] = useState<string | null>(null)
  const [campaignSort, setCampaignSort] = useState<SortState>({ key: 'cost', dir: 'desc' })
  const [dailySort, setDailySort] = useState<SortState>({ key: 'date', dir: 'desc' })
  const [dailyPage, setDailyPage] = useState(0)

  const orgLoadRef = useRef<string | null>(null)
  // Prevent duplicate in-flight dataset-list requests on rapid tab/org switches.
  const fetchingDatasetsRef = useRef(false)

  // Only poll while the cache is cold or uploads are still processing.
  useEffect(() => {
    if (!shouldRefreshDatasets) return
    const id = setInterval(() => setRefreshTick((t) => t + 1), LIVE_REFRESH_MS)
    return () => clearInterval(id)
  }, [shouldRefreshDatasets])

  const completedDatasets = useMemo(() => datasets.filter((d) => d.status === 'completed'), [datasets])
  const activeDataset = useMemo(
    () => completedDatasets.find((d) => d.id === activeDatasetId) ?? datasets.find((d) => d.id === activeDatasetId) ?? null,
    [completedDatasets, datasets, activeDatasetId],
  )
  const activeDateColumn = useMemo(() => getDashboardDateColumn(activeDataset), [activeDataset])

  const startDateValue = useMemo(
    () => (datePreset === 'custom' && dateRange.start ? format(dateRange.start, 'yyyy-MM-dd') : null),
    [datePreset, dateRange.start],
  )
  const endDateValue = useMemo(
    () => (datePreset === 'custom' && dateRange.end ? format(dateRange.end, 'yyyy-MM-dd') : null),
    [datePreset, dateRange.end],
  )
  const chartStartDateValue = useMemo(
    () => (dateRange.start ? format(dateRange.start, 'yyyy-MM-dd') : null),
    [dateRange.start],
  )
  const chartEndDateValue = useMemo(
    () => (dateRange.end ? format(dateRange.end, 'yyyy-MM-dd') : null),
    [dateRange.end],
  )

  const organizationScope = targetOrgId
    ?? (user?.role === 'admin' ? organizationId ?? 'admin-default' : user?.organization?.id ?? 'client-org')

  const analyticsRequestKey = activeDatasetId
    ? buildCacheKey({
        datasetId: activeDatasetId,
        organizationScope,
        datasetUpdatedAt: activeDataset?.updated_at ?? 'unknown',
        dateColumn: activeDateColumn,
        datePreset: datePreset ?? null,
        startDate: chartStartDateValue,
        endDate: chartEndDateValue,
      })
    : null
  const insightsRequestKey = analyticsRequestKey ? `insights::${analyticsRequestKey}` : null
  // Defer the analytics result so chart re-renders are low-priority — the
  // loading skeleton (loadingAnalytics) updates immediately while charts catch up.
  const deferredAnalytics = useDeferredValue(analytics)
  const analyticsResultRecord = useMemo(
    () => (deferredAnalytics?.result ?? null) as Record<string, unknown> | null,
    [deferredAnalytics],
  )
  const analyticsDataQualityWarnings = useMemo(
    () => getAnalyticsDataQualityWarnings(analyticsResultRecord),
    [analyticsResultRecord],
  )

  // Reset table/sort state when the active dataset changes.
  useEffect(() => {
    setSelectedCampaignDimension(null)
    setDailyPage(0)
  }, [activeDatasetId])

  // Sync channel-scoped dataset selection into the global store so ChatWidget
  // creates threads against the correct report_type dataset.
  useEffect(() => {
    setActiveDataset(activeDatasetId)
    return () => { setActiveDataset(null) }
  }, [activeDatasetId, setActiveDataset])

  // ── Pre-warm the backend Parquet cache ────────────────────────────────────
  // As soon as we know which dataset we will load, ask the backend to pull its
  // Parquet from Supabase Storage into its in-memory DataFrame cache.  This
  // runs in the background on the server, so by the time the analytics compute
  // request arrives the cache is already warm and responds in < 1 s.
  useEffect(() => {
    if (!session?.access_token || !activeDatasetId) return
    const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
    api.analytics.warm(activeDatasetId, session.access_token, effectiveOrgId)
  }, [activeDatasetId, session?.access_token, targetOrgId, user?.role, organizationId])

  // Load datasets filtered by report_type
  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      const token = session?.access_token
      if (!token) return

      // If a fetch is already in-flight, skip — the result from that request
      // will still drive the state update when it completes.
      if (shouldRefreshDatasets && fetchingDatasetsRef.current) return

      if (shouldRefreshDatasets) {
        fetchingDatasetsRef.current = true
        setLoadingDatasets(true)
      }

      setError(null)
      try {
        const data = shouldRefreshDatasets
          ? await api.datasets.list(token, effectiveOrgId)
          : globalDatasets
        if (cancelled) return

        if (shouldRefreshDatasets) {
          setGlobalDatasets(data, effectiveOrgId ?? null)
        }

        // Local sorting and filtering for this specific channel
        const filtered = data.filter(d => d.report_type === reportType)
        const sorted = [...filtered].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())

        const available = sorted.filter((d) => d.status === 'completed')
        const scopeKey = `${reportType}::${effectiveOrgId ?? 'client-org'}`

        if (orgLoadRef.current !== scopeKey) {
          orgLoadRef.current = scopeKey
          setActiveDatasetId(available.length > 0 ? available[0].id : null)
        } else {
          if (available.length > 0 && !available.some((d) => d.id === activeDatasetId)) {
            setActiveDatasetId(available[0].id)
          } else if (available.length === 0) {
            setActiveDatasetId(null)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load datasets')
      } finally {
        fetchingDatasetsRef.current = false
        if (!cancelled) setLoadingDatasets(false)
      }
    }

    void load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, organizationId, targetOrgId, user?.role, reportType, refreshTick, shouldRefreshDatasets])

  // Load analytics
  useEffect(() => {
    if (!session || !activeDatasetId) {
      setAnalytics(null)
      setLoadingAnalytics(false)
      return
    }
    // Wait for DateFilter to seed the default preset before firing any request.
    // Without this guard the first call fires with datePreset=null, which sends
    // no date bounds and causes the backend to return all-time data; then a
    // second call fires immediately after the preset initialises — causing a
    // double-fetch and a flicker on every page load.
    if (datePreset === null) return
    let cancelled = false

    async function load() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId || !analyticsRequestKey) return

      const cached = analyticsCache.get(analyticsRequestKey)
      if (cached) {
        startTransition(() => {
          setAnalytics(cached)
          setLastUpdated(new Date())
        })
        setLoadingAnalytics(false)
        return
      }

      setError(null)
      setIsTimeoutError(false)
      setLoadingAnalytics(true)
      try {
        const body = {
          dataset_id: datasetId,
          operation: 'auto' as const,
          ...(activeDateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? { date_preset: 'custom' as const, start_date: startDateValue!, end_date: endDateValue!, date_column: activeDateColumn }
              : datePreset && datePreset !== 'all_data' && chartStartDateValue && chartEndDateValue
                ? { date_preset: datePreset, start_date: chartStartDateValue, end_date: chartEndDateValue, date_column: activeDateColumn }
                : datePreset && datePreset !== 'all_data'
                  ? { date_preset: datePreset, date_column: activeDateColumn }
                  : {}
            : {}),
        }
        const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
        const result = await api.analytics.compute(body, token, effectiveOrgId)
        setCache(analyticsCache, analyticsRequestKey, result)
        if (!cancelled) {
          startTransition(() => {
            setAnalytics(result)
            setLastUpdated(new Date())
          })
        }
      } catch (err) {
        if (!cancelled) {
          const isTimeout = (err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('timeout')))
          if (isTimeout) {
            setIsTimeoutError(true)
            // Re-trigger warm so the automatic retry hits the cache
            if (session?.access_token && activeDatasetId) {
              const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
              api.analytics.warm(activeDatasetId, session.access_token, effectiveOrgId)
              setTimeout(() => { if (!cancelled) setRefreshTick(t => t + 1) }, 5000)
            }
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load analytics')
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingAnalytics(false)
          // Reset pagination and sorting when the dataset or range changes
          // to prevent showing a blank page if the new result is smaller.
          setDailyPage(0)
          setCampaignSort({ key: 'cost', dir: 'desc' })
          setDailySort({ key: 'date', dir: 'desc' })
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [session, activeDatasetId, analyticsRequestKey, datePreset, dateRange.start, dateRange.end, startDateValue, endDateValue, chartStartDateValue, chartEndDateValue, activeDateColumn, organizationId, targetOrgId, user?.role])

  // Load AI insights
  useEffect(() => {
    if (!session || !activeDatasetId || loadingAnalytics) {
      setInsights([])
      setInsightsError(
        !loadingAnalytics && analyticsDataQualityWarnings.length > 0
          ? 'AI insights are hidden until dataset parsing issues are resolved.'
          : null,
      )
      setLoadingInsights(false)
      return
    }

    if (analyticsDataQualityWarnings.length > 0) {
      setInsights([])
      setInsightsError('AI insights are hidden until dataset parsing issues are resolved.')
      setLoadingInsights(false)
      return
    }
    let cancelled = false

    async function load() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId || !insightsRequestKey) return

      const cached = insightsCache.get(insightsRequestKey)
      if (cached) {
        startTransition(() => {
          setInsights(cached.insights)
        })
        setLoadingInsights(false)
        return
      }

      try {
        const body = {
          dataset_id: datasetId,
          ...(activeDateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? { start_date: startDateValue!, end_date: endDateValue!, date_column: activeDateColumn }
              : datePreset && datePreset !== 'all_data' ? { date_preset: datePreset, date_column: activeDateColumn } : {}
            : {}),
        }
        const effectiveOrgId = targetOrgId ?? (user?.role === 'admin' ? organizationId ?? undefined : undefined)
        const result = await api.analytics.getInsights(body, token, effectiveOrgId)
        setCache(insightsCache, insightsRequestKey, result)
        if (!cancelled) {
          startTransition(() => {
            setInsights(result.insights)
          })
        }
      } catch (err) {
        if (!cancelled) {
          setInsights([])
          setInsightsError(err instanceof Error ? err.message : 'Failed to load AI insights')
        }
      } finally {
        if (!cancelled) setLoadingInsights(false)
      }
    }

    setInsightsError(null)
    setLoadingInsights(true)
    void load()
    return () => { cancelled = true }
  }, [session, activeDatasetId, insightsRequestKey, loadingAnalytics, datePreset, dateRange.start, dateRange.end, startDateValue, endDateValue, activeDateColumn, organizationId, targetOrgId, user?.role, analyticsDataQualityWarnings, insightsRetryTick])

  const retryInsights = useCallback(() => {
    if (insightsRequestKey) insightsCache.delete(insightsRequestKey)
    setInsightsRetryTick((t) => t + 1)
  }, [insightsRequestKey])

  // ── ViewModel ─────────────────────────────────────────────────────────────

  const viewModel = useMemo(() => {
    const result = analyticsResultRecord ?? {}
    const numericSummary = (result.numeric_summary ?? {}) as NumericSummary
    const numericTotals = (result.numeric_totals ?? {}) as NumericTotals
    const comparison = (result.comparison ?? {}) as MetricComparison
    const metricTimeSeries = (result.metric_time_series ?? {}) as MetricTimeSeries
    const metricBreakdowns = (result.metric_breakdowns ?? {}) as MetricBreakdowns
    const shape = (result.shape ?? null) as { rows: number; cols: number } | null
    const comparisonWindow = (result.comparison_window ?? null) as ComparisonWindow | null
    const comparisonAttempted = comparisonWindow !== null
    const granularity = (result.granularity ?? 'daily') as 'daily' | 'monthly'
    const priorLabel = buildPriorLabel(comparisonWindow)
    const noDataLabel = buildNoDataLabel(comparisonAttempted, priorLabel)

    const numericColumns = Object.keys(numericSummary)
    const resultMappings = (result.metric_mappings ?? activeDataset?.metric_mappings ?? {}) as Record<string, string | null>
    const metricColumns = getVerifiedMetricColumns(metricDefinitions, resultMappings, numericColumns)
    const conversionsColumn = pickConversionsColumn(resultMappings, numericColumns)

    const getMetricValues = (key: string) => {
      const col = key === 'conversions' && !metricColumns[key] ? conversionsColumn : metricColumns[key]
      if (!col) return { current: null, previous: null }
      return {
        current: comparison[col]?.current ?? numericTotals[col] ?? null,
        previous: comparison[col]?.previous ?? null,
      }
    }

    const cards: MetricCardData[] = metricDefinitions.map((def) => {
      const column = def.key === 'conversions' && !metricColumns[def.key] ? conversionsColumn : metricColumns[def.key]
      let value: number | null = null
      let delta: number | null = null

      const isDerived = ['ctr', 'avg_cpc', 'roas', 'cpa', 'conversion_rate', 'aov'].includes(def.key)

      if (column && !isDerived) {
        value = def.kind === 'percent' || def.kind === 'ratio'
          ? comparison[column]?.current ?? numericSummary[column]?.mean ?? null
          : comparison[column]?.current ?? numericTotals[column] ?? null
        delta = comparison[column]?.delta_pct ?? null
      } else if (isDerived) {
        let currNum: number | null = null
        let currDen: number | null = null
        let prevNum: number | null = null
        let prevDen: number | null = null

        if (def.key === 'ctr') {
          const c = getMetricValues('clicks'); const i = getMetricValues('impressions')
          currNum = c.current; currDen = i.current; prevNum = c.previous; prevDen = i.previous
        } else if (def.key === 'avg_cpc') {
          const co = getMetricValues('cost'); const c = getMetricValues('clicks')
          currNum = co.current; currDen = c.current; prevNum = co.previous; prevDen = c.previous
        } else if (def.key === 'roas') {
          const r = getMetricValues('revenue'); const co = getMetricValues('cost')
          currNum = r.current; currDen = co.current; prevNum = r.previous; prevDen = co.previous
        } else if (def.key === 'cpa') {
          const co = getMetricValues('cost'); const conv = getMetricValues('conversions')
          currNum = co.current; currDen = conv.current; prevNum = co.previous; prevDen = conv.previous
        } else if (def.key === 'conversion_rate') {
          const conv = getMetricValues('conversions'); const c = getMetricValues('clicks')
          currNum = conv.current; currDen = c.current; prevNum = conv.previous; prevDen = c.previous
        } else if (def.key === 'aov') {
          const r = getMetricValues('revenue'); const conv = getMetricValues('conversions')
          currNum = r.current; currDen = conv.current; prevNum = r.previous; prevDen = conv.previous
        }

        if (currNum != null && currDen != null && currDen > 0) {
          // CTR: store as ratio (0–1); formatPercent multiplies by 100.
          // ROAS is stored as revenue / cost and displayed as a percentage.
          value = currNum / currDen
        }
        if (prevNum != null && prevDen != null && prevDen > 0 && value != null) {
          const prev = prevNum / prevDen
          if (prev !== 0) delta = ((value - prev) / Math.abs(prev)) * 100
        }
      }

      const trendDirection: MetricCardData['trendDirection'] =
        delta == null || Math.abs(delta) < 0.05
          ? 'neutral'
          : INVERTED_TREND_KEYS.has(def.key)
            ? delta > 0 ? 'negative' : 'positive'
            : delta > 0 ? 'positive' : 'negative'

      return { key: def.key, label: def.label, value: formatMetricValue(def.kind, value), delta, trendDirection, priorLabel, noDataLabel, comparisonAttempted, tooltip: def.tooltip }
    })

    // Resolve time-series data
    const firstDateKey = (
      activeDataset?.detected_date_column && metricTimeSeries[activeDataset.detected_date_column]
        ? activeDataset.detected_date_column
        : Object.keys(metricTimeSeries)[0]
    )

    const getSeriesForColumn = (col: string | null) =>
      col && firstDateKey ? (metricTimeSeries[firstDateKey]?.[col] ?? []) : []

    const clicksSeries = getSeriesForColumn(metricColumns.clicks)
    const impressionsSeries = getSeriesForColumn(metricColumns.impressions)
    const revenueSeries = getSeriesForColumn(metricColumns.revenue)
    const costSeries = getSeriesForColumn(metricColumns.cost)
    const conversionsSeries = getSeriesForColumn(conversionsColumn)
    const chartBounds = {
      startDate: chartStartDateValue,
      endDate: chartEndDateValue,
    }
    const trendData = buildRevenueCostTrendData(revenueSeries, costSeries, chartBounds, datePreset)
    const clicksCtrData = buildClicksCtrData(clicksSeries, impressionsSeries, chartBounds, datePreset)
    const roasData = buildRoasData(revenueSeries, costSeries, chartBounds, datePreset)
    const clicksCpcData = buildClicksCpcData(clicksSeries, costSeries, chartBounds, datePreset)

    const transactionsCpaData = buildTransactionsCpaData(conversionsSeries, costSeries, chartBounds, datePreset)
    const conversionRateData = buildConversionRateData(conversionsSeries, clicksSeries, chartBounds, datePreset)

    const revenueDistribution: RevenueSplitDatum[] = (() => {
      const revenueColumn = metricColumns.revenue
      if (!revenueColumn) return []
      
      const allBreakdownCols = Object.values(metricBreakdowns).flatMap((byCat) => Object.keys(byCat))
      const campaignDimension = allBreakdownCols.find((col) => CAMPAIGN_PATTERNS.some((p) => p.test(col)))
      if (!campaignDimension) return []
      
      const campaignRevenues = metricBreakdowns[revenueColumn]?.[campaignDimension]
      if (!campaignRevenues) return []
      
      const sorted = Object.entries(campaignRevenues)
        .sort((a, b) => b[1] - a[1])
        .filter(([, val]) => val > 0)
        
      if (sorted.length === 0) return []
      
      const top5 = sorted.slice(0, 5)
      const others = sorted.slice(5).reduce((acc, [, val]) => acc + val, 0)
      
      const palette = ['#4285f4', '#34a853', '#fbbc05', '#ea4335', '#f39c12', '#9ea0a4']
      
      const data: RevenueSplitDatum[] = top5.map(([name, value], i) => ({
        name: name.length > 22 ? name.substring(0, 22) + '...' : name,
        value,
        color: palette[i % palette.length],
      }))
      
      if (others > 0) {
        data.push({ name: 'Other', value: others, color: palette[5] })
      }
      
      return data
    })()

    // ── Campaign Breakdown ───────────────────────────────────────────────────
    const campaignRows = (result.campaign_performance ?? []) as CampaignRow[]

    // ── Daily Performance (all date periods within the selected range) ──────
    const dailyRows = (result.daily_performance ?? []) as DailyRow[]

    // Collect all available campaign dimensions for the picker dropdown.
    const availableCampaignDimensions: string[] = (() => {
      const seenDims = new Set<string>()
      for (const byCat of Object.values(metricBreakdowns)) {
        for (const col of Object.keys(byCat)) {
          if (CAMPAIGN_PATTERNS.some((p) => p.test(col))) seenDims.add(col)
        }
      }
      return Array.from(seenDims).sort(
        (a, b) => scoreCampaignDimension(a) - scoreCampaignDimension(b),
      )
    })()

    return {
      shape,
      cards,
      trendData,
      clicksCtrData,
      clicksCpcData,
      transactionsCpaData,
      conversionRateData,
      roasData,
      revenueDistribution,
      campaignRows,
      dailyRows,
      availableCampaignDimensions,
      granularity,
    }
  }, [analyticsResultRecord, activeDataset, chartEndDateValue, chartStartDateValue, datePreset])

  const sectionInsights = useMemo(() => splitInsightsBySection(insights), [insights])

  const DAILY_PAGE_SIZE = 30

  const sortedCampaignRows = useMemo(
    () => applySortToRows(viewModel.campaignRows as Record<string, unknown>[], campaignSort) as CampaignRow[],
    [viewModel.campaignRows, campaignSort],
  )

  const sortedDailyRows = useMemo(
    () => applySortToRows(viewModel.dailyRows as Record<string, unknown>[], dailySort) as DailyRow[],
    [viewModel.dailyRows, dailySort],
  )

  const dailyPageCount = Math.ceil(sortedDailyRows.length / DAILY_PAGE_SIZE)
  const pagedDailyRows = useMemo(
    () => sortedDailyRows.slice(dailyPage * DAILY_PAGE_SIZE, (dailyPage + 1) * DAILY_PAGE_SIZE),
    [sortedDailyRows, dailyPage],
  )

  // ── Stable event handler references ────────────────────────────────────────
  // useCallback prevents child table rows / header cells from re-rendering
  // when unrelated state (loading flags, insights) causes ChannelPage to re-render.
  const handleCampaignSort = useCallback(
    (key: string) => setCampaignSort((s) => toggleSort(s, key)),
    [],
  )
  const handleDailySort = useCallback(
    (key: string) => { setDailySort((s) => toggleSort(s, key)); setDailyPage(0) },
    [],
  )
  const handlePrevPage = useCallback(() => setDailyPage((p) => p - 1), [])
  const handleNextPage = useCallback(() => setDailyPage((p) => p + 1), [])
  const handleDimensionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCampaignDimension(e.target.value),
    [],
  )

  // ── Stable series arrays for memoized chart props ────────────────────────
  const clicksCtrSeries = useMemo(
    () => [
      { type: 'bar' as const,  dataKey: 'clicks', name: 'Clicks', color: accentColor, axis: 'l' as const },
      { type: 'line' as const, dataKey: 'ctr',    name: 'CTR %',  color: '#f5b800',   axis: 'r' as const },
    ],
    [accentColor],
  )
  const clicksCpcSeries = useMemo(
    () => [
      { type: 'bar' as const,  dataKey: 'clicks', name: 'Clicks',    color: accentColor, axis: 'l' as const },
      { type: 'line' as const, dataKey: 'cpc',    name: 'Avg CPC $', color: '#f97316',   axis: 'r' as const },
    ],
    [accentColor],
  )
  const transactionsCpaSeries = useMemo(
    () => [
      { type: 'bar' as const,  dataKey: 'transactions', name: 'Transactions', color: accentColor, axis: 'l' as const },
      { type: 'line' as const, dataKey: 'cpa',          name: 'CPA $',        color: '#f5b800',   axis: 'r' as const },
    ],
    [accentColor],
  )
  const conversionRateSeries = useMemo(
    () => [
      {
        type: 'area' as const,
        dataKey: 'conversionRate',
        name: 'Conversion Rate',
        color: accentColor,
        gradientId: `conversion-rate-${reportType}`,
        gradientOpacity: 0.18,
      },
    ],
    [accentColor, reportType],
  )
  const revenueCostSeries = useMemo(
    () => [
      { type: 'area' as const, dataKey: 'revenue', name: 'Revenue', color: '#f5b800', gradientId: `rev-${reportType}` },
      { type: 'area' as const, dataKey: 'cost',    name: 'Cost',    color: '#f97316', gradientId: `cost-${reportType}`, gradientOpacity: 0.16 },
    ],
    [reportType],
  )
  const roasSeries = useMemo(
    () => [
      { type: 'area' as const, dataKey: 'roas', name: 'ROAS', color: accentColor, gradientId: `roas-${reportType}`, gradientOpacity: 0.2 },
    ],
    [accentColor, reportType],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div id="dashboard-pdf-content" className="space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8 sm:space-y-8 animate-fade-in">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">
            {channelName} Performance
            {lastUpdated && (
              <span className="ml-3 text-[11px] font-normal text-muted-foreground align-middle">
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Detailed analytics for your {channelName} campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilter />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {activeDataset && activeDataset.ingestion_warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{activeDataset.ingestion_warnings.join(' ')}</span>
        </div>
      )}
      {analyticsDataQualityWarnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{analyticsDataQualityWarnings.join(' ')}</span>
        </div>
      )}

      {!loadingDatasets && completedDatasets.length === 0 ? (
        <EmptyDashboardState channelName={channelName} />
      ) : isTimeoutError && !analytics ? (
        <TimeoutScreen channelName={channelName} />
      ) : (
        <>
          {/* ── KPI Cards were moved to their respective sections ────────────────── */}

            {/* ── Traffic Performance ─────────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Traffic Performance</h2>

              {loadingAnalytics ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <KPICard key={i} title="" value="" loading />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 stagger-children">
                  {viewModel.cards.filter(c => ['impressions', 'clicks', 'ctr', 'avg_cpc'].includes(c.key)).map((card) => (
                    <KPICard
                      key={card.key}
                      title={card.label}
                      value={card.value}
                      trendValue={card.delta}
                      trendDirection={card.trendDirection}
                      priorLabel={card.priorLabel}
                      noDataLabel={card.noDataLabel}
                      tooltip={card.tooltip}
                    />
                  ))}
                </div>
              )}

              {loadingAnalytics ? (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
                      <div className="shimmer-warm h-4 w-36 rounded" />
                      <div className="shimmer-warm mt-4 h-[280px] rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  <ChartCard
                    title="Clicks vs CTR"
                    empty={viewModel.clicksCtrData.length === 0}
                    emptyMsg="Need a date column plus clicks and impressions to draw this chart."
                    dataCount={viewModel.clicksCtrData.length || undefined}
                    granularity={viewModel.granularity}
                  >
                    <DualAxisComboChart
                      data={viewModel.clicksCtrData as Record<string, unknown>[]}
                      series={clicksCtrSeries}
                      leftTickFormatter={formatCompactNumber}
                      rightTickFormatter={fmtCtrRight}
                      tooltipFormatter={fmtCtrTooltip}
                      granularity={viewModel.granularity}
                    />
                  </ChartCard>

                  <ChartCard
                    title="Clicks vs Avg CPC"
                    empty={viewModel.clicksCpcData.length === 0}
                    emptyMsg="Need a date column plus clicks and cost columns to draw this chart."
                    dataCount={viewModel.clicksCpcData.length || undefined}
                    granularity={viewModel.granularity}
                  >
                    <DualAxisComboChart
                      data={viewModel.clicksCpcData as Record<string, unknown>[]}
                      series={clicksCpcSeries}
                      leftTickFormatter={formatCompactNumber}
                      rightTickFormatter={fmtCpcRight}
                      tooltipFormatter={fmtCpcTooltip}
                      granularity={viewModel.granularity}
                    />
                  </ChartCard>
                </div>
              )}
            </section>

            <OverallInsights
              insights={sectionInsights.traffic}
              loading={loadingInsights}
              error={insightsError}
              onRetry={retryInsights}
              title="Traffic Insights"
              emptyMessage="No traffic insights available for this dataset."
            />

            <section className="space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Transaction Performance</h2>

              {loadingAnalytics ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <KPICard key={i} title="" value="" loading />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 stagger-children">
                  {viewModel.cards.filter(c => ['conversions', 'cpa', 'conversion_rate'].includes(c.key)).map((card) => (
                    <KPICard
                      key={card.key}
                      title={card.label}
                      value={card.value}
                      trendValue={card.delta}
                      trendDirection={card.trendDirection}
                      priorLabel={card.priorLabel}
                      noDataLabel={card.noDataLabel}
                      tooltip={card.tooltip}
                    />
                  ))}
                </div>
              )}

              {loadingAnalytics ? (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
                      <div className="shimmer-warm h-4 w-36 rounded" />
                      <div className="shimmer-warm mt-4 h-[280px] rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  <ChartCard
                    title="Transactions vs CPA"
                    empty={!hasTransactionsOrCpaData(viewModel.transactionsCpaData)}
                    emptyMsg="Need conversions and cost data with a date column to draw this chart."
                    dataCount={viewModel.transactionsCpaData.length || undefined}
                    granularity={viewModel.granularity}
                  >
                    <DualAxisComboChart
                      data={viewModel.transactionsCpaData as Record<string, unknown>[]}
                      series={transactionsCpaSeries}
                      connectNulls={true}
                      leftTickFormatter={formatCompactNumber}
                      rightTickFormatter={fmtCpaRight}
                      tooltipFormatter={fmtCpaTooltip}
                      granularity={viewModel.granularity}
                    />
                  </ChartCard>

                  <ChartCard
                    title="Conversion Rate Trend"
                    empty={!hasConversionRateData(viewModel.conversionRateData)}
                    emptyMsg="Need conversions and clicks data with a date column to compute conversion rate."
                    dataCount={viewModel.conversionRateData.length || undefined}
                    granularity={viewModel.granularity}
                  >
                    <AreaTrendChart
                      data={viewModel.conversionRateData as Record<string, unknown>[]}
                      series={conversionRateSeries}
                      connectNulls={true}
                      curveType="linear"
                      tickFormatter={fmtConvRateTick}
                      tooltipFormatter={fmtConvRateTooltip}
                      granularity={viewModel.granularity}
                    />
                  </ChartCard>
                </div>
              )}
            </section>

            <OverallInsights
              insights={sectionInsights.conversion}
              loading={loadingInsights}
              error={insightsError}
              onRetry={retryInsights}
              title="Conversion Insights"
              emptyMessage="No conversion insights available for this dataset."
            />

            {/* ── Revenue Performance ─────────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Revenue Performance</h2>

              {loadingAnalytics ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <KPICard key={i} title="" value="" loading />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 stagger-children">
                  {viewModel.cards.filter(c => ['revenue', 'cost', 'roas', 'aov'].includes(c.key)).map((card) => (
                    <KPICard
                      key={card.key}
                      title={card.label}
                      value={card.value}
                      trendValue={card.delta}
                      trendDirection={card.trendDirection}
                      priorLabel={card.priorLabel}
                      noDataLabel={card.noDataLabel}
                      tooltip={card.tooltip}
                    />
                  ))}
                </div>
              )}

              {loadingAnalytics ? (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
                      <div className="shimmer-warm h-4 w-36 rounded" />
                      <div className="shimmer-warm mt-4 h-[280px] rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  <ChartCard
                    title="Revenue vs Cost"
                    empty={viewModel.trendData.length === 0}
                    emptyMsg="Need a date column plus revenue and cost columns to draw this chart."
                    dataCount={viewModel.trendData.length || undefined}
                    granularity={viewModel.granularity}
                  >
                    <AreaTrendChart
                      data={viewModel.trendData as Record<string, unknown>[]}
                      series={revenueCostSeries}
                      tickFormatter={fmtRevenueTick}
                      tooltipFormatter={fmtRevenueCostTooltip}
                      granularity={viewModel.granularity}
                    />
                  </ChartCard>

                  <ChartCard
                    title="ROAS Trend"
                    empty={viewModel.roasData.filter((p) => p.roas != null).length === 0}
                    emptyMsg="Need revenue and cost columns with a date column to compute ROAS trend."
                    dataCount={viewModel.roasData.length || undefined}
                    granularity={viewModel.granularity}
                  >
                    <AreaTrendChart
                      data={viewModel.roasData as Record<string, unknown>[]}
                      series={roasSeries}
                      tickFormatter={fmtRoasTick}
                      tooltipFormatter={fmtRoasTooltip}
                      granularity={viewModel.granularity}
                    />
                  </ChartCard>
                </div>
              )}
            </section>

            <OverallInsights
              insights={sectionInsights.revenue}
              loading={loadingInsights}
              error={insightsError}
              onRetry={retryInsights}
              title="Revenue Insights"
              emptyMessage="No revenue insights available for this dataset."
            />

            <section className="space-y-4">
              <h2 className="text-lg font-bold">Revenue Distribution</h2>
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                <ChartCard
                  title="Revenue by Campaign (Top 5)"
                  empty={viewModel.revenueDistribution.length === 0}
                  emptyMsg="Need a campaign revenue breakdown to draw this chart."
                >
                  <DistributionChart data={viewModel.revenueDistribution} />
                </ChartCard>

                <OverallInsights
                  insights={sectionInsights.distribution}
                  loading={loadingInsights}
                  error={insightsError}
                  onRetry={retryInsights}
                  title="Distribution Insights"
                  emptyMessage="No distribution insights available for this dataset."
                />
              </div>
            </section>


            {/* ── Campaign Breakdown table ─────────────────────────────── */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Campaign Breakdown</h2>
                {viewModel.availableCampaignDimensions.length > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Group by</span>
                    <select
                      value={selectedCampaignDimension ?? viewModel.availableCampaignDimensions[0]}
                      onChange={handleDimensionChange}
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {viewModel.availableCampaignDimensions.map((dim) => (
                        <option key={dim} value={dim}>
                          {labelForDimension(dim)} — {dim}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card card-shadow overflow-x-auto">
                {loadingAnalytics ? (
                  <div className="p-4 space-y-3">
                    <div className="shimmer-warm h-10 w-full rounded" />
                    <div className="shimmer-warm h-24 w-full rounded" />
                  </div>
                ) : sortedCampaignRows.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                    No campaign dimension found. Add a &quot;Campaign&quot; or &quot;Ad Set&quot; column to enable this breakdown.
                  </div>
                ) : (
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {labelForDimension(selectedCampaignDimension ?? viewModel.availableCampaignDimensions[0] ?? 'Campaign')}
                        </th>
                        {([
                          ['impressions', 'Impressions'],
                          ['clicks', 'Clicks'],
                          ['ctr', 'CTR'],
                          ['cpc', 'Avg CPC'],
                          ['cost', 'Cost'],
                          ['conversions', 'Conv.'],
                          ['revenue', 'Revenue'],
                          ['atv', 'Avg Order'],
                          ['roas', 'ROAS'],
                        ] as [string, string][]).map(([key, label]) => {
                          const active = campaignSort.key === key
                          return (
                            <th
                              key={key}
                              onClick={() => handleCampaignSort(key)}
                              className="cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground transition-colors"
                            >
                              <span className="inline-flex items-center justify-end gap-0.5">
                                {label}
                                {active ? (
                                  campaignSort.dir === 'asc'
                                    ? <ChevronUp className="h-3 w-3" />
                                    : <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronsUpDown className="h-3 w-3 opacity-30" />
                                )}
                              </span>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCampaignRows.map((row, i) => (
                        <tr
                          key={row.name}
                          className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${i === 0 && campaignSort.key === 'cost' && campaignSort.dir === 'desc' ? 'bg-primary/5' : ''}`}
                        >
                          <td className="max-w-[220px] truncate px-4 py-3 font-medium" title={row.name}>
                            {row.name}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.impressions)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.clicks)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtPct(row.ctr)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.cpc)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.cost)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.conversions)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.revenue)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.atv)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${
                            row.roas == null || row.roas === 0 ? 'text-muted-foreground' : 'text-foreground'
                          }`}>
                            {fmtRoasPercent(row.roas)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* ── Daily Performance table ──────────────────────────────── */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Daily Performance</h2>
                {sortedDailyRows.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {sortedDailyRows.length} {sortedDailyRows.length === 1 ? 'day' : 'days'}
                  </span>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card card-shadow overflow-x-auto">
                {loadingAnalytics ? (
                  <div className="p-4 space-y-3">
                    <div className="shimmer-warm h-10 w-full rounded" />
                    <div className="shimmer-warm h-24 w-full rounded" />
                  </div>
                ) : sortedDailyRows.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                    No daily data available. Upload a dataset with a date column to enable this table.
                  </div>
                ) : (
                  <>
                  {/* Scrollable table body — header stays pinned, rows scroll */}
                  <div className="overflow-auto max-h-[520px]">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {/* Date column — sortable */}
                        <th
                          onClick={() => handleDailySort('date')}
                          className="sticky top-0 z-10 bg-[hsl(var(--card))] cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground transition-colors"
                        >
                          <span className="inline-flex items-center gap-0.5">
                            Date
                            {dailySort.key === 'date' ? (
                              dailySort.dir === 'asc'
                                ? <ChevronUp className="h-3 w-3" />
                                : <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </span>
                        </th>
                        {([
                          ['impressions', 'Impr.'],
                          ['clicks', 'Clicks'],
                          ['ctr', 'CTR'],
                          ['cpc', 'CPC'],
                          ['cost', 'Cost'],
                          ['conversions', 'Conv.'],
                          ['revenue', 'Revenue'],
                          ['atv', 'Avg Order'],
                          ['roas', 'ROAS'],
                        ] as [string, string][]).map(([key, label]) => {
                          const active = dailySort.key === key
                          return (
                            <th
                              key={key}
                              onClick={() => handleDailySort(key)}
                              className="sticky top-0 z-10 bg-[hsl(var(--card))] cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground transition-colors"
                            >
                              <span className="inline-flex items-center justify-end gap-0.5">
                                {label}
                                {active ? (
                                  dailySort.dir === 'asc'
                                    ? <ChevronUp className="h-3 w-3" />
                                    : <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronsUpDown className="h-3 w-3 opacity-30" />
                                )}
                              </span>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDailyRows.map((row) => (
                        <tr
                          key={row.date}
                          className="border-b border-border/50 transition-colors hover:bg-muted/30"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {(() => {
                              try {
                                return new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              } catch {
                                return row.date
                              }
                            })()}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.impressions)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.clicks)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtPct(row.ctr)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.cpc)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.cost)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.conversions)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.revenue)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.atv)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${
                            row.roas == null || row.roas === 0 ? 'text-muted-foreground' : 'text-foreground'
                          }`}>
                            {fmtRoasPercent(row.roas)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>{/* end scrollable wrapper */}
                  {/* Pagination — centered so it is never obscured by the chat FAB on the right */}
                  {dailyPageCount > 1 && (
                    <div className="flex flex-col items-center gap-1 border-t border-border px-4 py-4 pb-6 sm:flex-row sm:justify-center sm:gap-3">
                      <span className="text-xs text-muted-foreground">
                        Showing {dailyPage * DAILY_PAGE_SIZE + 1}–{Math.min((dailyPage + 1) * DAILY_PAGE_SIZE, sortedDailyRows.length)} of {sortedDailyRows.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={dailyPage === 0}
                          onClick={handlePrevPage}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-[5rem] rounded-lg bg-muted/60 px-3 py-1 text-center text-xs font-medium text-muted-foreground">
                          {dailyPage + 1} / {dailyPageCount}
                        </span>
                        <button
                          disabled={dailyPage >= dailyPageCount - 1}
                          onClick={handleNextPage}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </div>
            </section>

          </>
        )}
    </div>
  )
}
