'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
// (date-fns format used for start/end date value computation)
import { AlertCircle, Database } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardStore } from '@/store/dashboard'
import { api } from '@/lib/api'
import { DateFilter } from '@/components/dashboard/DateFilter'
import { OverallInsights } from '@/components/dashboard/OverallInsights'
import { KPICard } from '@/components/dashboard/KPICard'
import { ChartCard, DualAxisComboChart, AreaTrendChart, DistributionChart } from '@/components/dashboard/ChannelChart'
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
const INVERTED_TREND_KEYS = new Set(['cost', 'avg_cpc'])

type MetricCardData = {
  key: string
  label: string
  value: string
  delta: number | null
  trendDirection: 'positive' | 'negative' | 'neutral'
  tooltip: string
}

type TrendPoint = {
  date: string
  revenue?: number
  cost?: number
}

type ClicksCtrPoint = {
  date: string
  clicks?: number
  ctr?: number
}

type ClicksCpcPoint = {
  date: string
  clicks?: number
  cpc?: number
}

type TransactionsCpaPoint = {
  date: string
  transactions?: number
  cpa?: number
}

type RoasPoint = {
  date: string
  roas?: number
}

type ConversionRatePoint = {
  date: string
  conversionRate?: number
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
  ctr: number | null
  cpc: number | null
  roas: number | null
}

type DailyRow = {
  date: string
  impressions: number | null
  clicks: number | null
  cost: number | null
  revenue: number | null
  conversions: number | null
  ctr: number | null
  cpc: number | null
  roas: number | null
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
    key: 'cost',
    label: 'COST',
    kind: 'currency',
    patterns: [/\bcost\b/i, /\bspend\b/i, /ad[\s_-]*spend/i, /amount[\s_-]*spent/i],
    tooltip: 'Total ad spend this period.',
  },
  {
    key: 'revenue',
    label: 'REVENUE',
    kind: 'currency',
    patterns: [/\brevenue\b/i, /\bsales\b/i, /\bgmv\b/i, /\bpurchase[\s_-]*value/i, /\bconversion[\s_-]*value/i],
    tooltip: 'Revenue from ad-driven customers.',
  },
  {
    key: 'roas',
    label: 'ROAS',
    kind: 'ratio',
    patterns: [/\broas\b/i, /return[\s_-]*on[\s_-]*ad[\s_-]*spend/i],
    tooltip: 'Revenue earned per $1 of ad spend.',
  },
]

// Columns that look like a campaign dimension (covers: campaign, campaign name, ad set, ad group, ad_group_name, ad set name, etc.)
const CAMPAIGN_PATTERNS = [
  /campaign/i,
  /ad[\s_-]*group/i,
  /ad[\s_-]*set/i,
  /ad[\s_-]*name/i,
  /ad\s*title/i,
  /adset/i,
  /adgroup/i,
]

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

function pickMetricColumn(columns: string[], patterns: RegExp[]) {
  return columns.find((col) => patterns.some((p) => p.test(col))) ?? null
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function formatPercent(value: number) {
  const v = Math.abs(value) <= 1 ? value * 100 : value
  return `${v.toFixed(2)}%`
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

// ─── Table cell formatters ────────────────────────────────────────────────────

function fmtN(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)
}
function fmtCur(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}
function fmtPct(v: number | null) {
  if (v == null) return '—'
  const pv = Math.abs(v) <= 1 ? v * 100 : v
  return `${pv.toFixed(2)}%`
}
function fmtX(v: number | null) {
  if (v == null) return '—'
  return `${v.toFixed(2)}x`
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
}

function getChannelSubtitle(channelName: string) {
  return `Detailed analytics for your ${channelName} campaigns`
}

function getInsightChunks(insights: AIInsight[]) {
  return {
    traffic: insights.slice(0, 4),
    conversion: insights.slice(4, 8),
    revenue: insights.slice(8, 12),
    distribution: insights.slice(12, 15),
  }
}

const LIVE_REFRESH_MS = 30_000

export function ChannelPage({ reportType, channelName, accentColor, accentLight: _accentLight, accentText: _accentText }: ChannelPageProps) {
  void _accentLight
  void _accentText
  const { session, organizations, user } = useAuth()
  const { organizationId, datePreset, dateRange } = useDashboardStore()

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null)
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const orgLoadRef = useRef<string | null>(null)

  // 30-second live refresh
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), LIVE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

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

  const organizationScope = user?.role === 'admin'
    ? organizationId ?? 'admin-default'
    : user?.organization?.id ?? 'client-org'

  const analyticsRequestKey = activeDatasetId
    ? buildCacheKey({
        datasetId: activeDatasetId,
        organizationScope,
        datasetUpdatedAt: activeDataset?.updated_at ?? 'unknown',
        dateColumn: activeDateColumn,
        datePreset: datePreset ?? null,
        startDate: startDateValue,
        endDate: endDateValue,
      })
    : null
  const insightsRequestKey = analyticsRequestKey ? `insights::${analyticsRequestKey}` : null

  const activeOrganizationName = organizations.find((org) => org.id === organizationId)?.name
    ?? user?.organization?.name
    ?? 'Client Workspace'

  // Load datasets filtered by report_type
  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      const token = session?.access_token
      if (!token) return
      setLoadingDatasets(true)
      setError(null)
      try {
        const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
        const data = await api.datasets.list(token, targetOrgId, undefined, reportType)
        if (cancelled) return

        const sorted = [...data].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
        setDatasets(sorted)

        const available = sorted.filter((d) => d.status === 'completed')
        const scopeKey = `${reportType}::${targetOrgId ?? 'client-org'}`

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
        if (!cancelled) setLoadingDatasets(false)
      }
    }

    void load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, organizationId, user?.role, reportType, refreshTick])

  // Load analytics
  useEffect(() => {
    if (!session || !activeDatasetId) {
      setAnalytics(null)
      setLoadingAnalytics(false)
      return
    }
    let cancelled = false

    async function load() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId || !analyticsRequestKey) return

      const cached = analyticsCache.get(analyticsRequestKey)
      if (cached) { setAnalytics(cached); setLastUpdated(new Date()); setLoadingAnalytics(false); return }

      setError(null)
      setLoadingAnalytics(true)
      try {
        const body = {
          dataset_id: datasetId,
          operation: 'auto' as const,
          ...(activeDateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? { start_date: startDateValue!, end_date: endDateValue!, date_column: activeDateColumn }
              : datePreset
                ? { date_preset: datePreset, date_column: activeDateColumn }
                : {}
            : {}),
        }
        const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
        const result = await api.analytics.compute(body, token, targetOrgId)
        setCache(analyticsCache, analyticsRequestKey, result)
        if (!cancelled) { setAnalytics(result); setLastUpdated(new Date()) }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error && err.name === 'AbortError'
            ? 'Analytics timed out. Try narrowing the date range.'
            : err instanceof Error ? err.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) setLoadingAnalytics(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [session, activeDatasetId, analyticsRequestKey, datePreset, dateRange.start, dateRange.end, startDateValue, endDateValue, activeDateColumn, organizationId, user?.role])

  // Load AI insights
  useEffect(() => {
    if (!session || !activeDatasetId || loadingAnalytics) {
      setInsights([])
      setInsightsError(null)
      setLoadingInsights(false)
      return
    }
    let cancelled = false

    async function load() {
      const token = session?.access_token
      const datasetId = activeDatasetId
      if (!token || !datasetId || !insightsRequestKey) return

      const cached = insightsCache.get(insightsRequestKey)
      if (cached) { setInsights(cached.insights); setLoadingInsights(false); return }

      setLoadingInsights(true)
      setInsightsError(null)
      try {
        const body = {
          dataset_id: datasetId,
          ...(activeDateColumn
            ? datePreset === 'custom' && dateRange.start && dateRange.end
              ? { start_date: startDateValue!, end_date: endDateValue!, date_column: activeDateColumn }
              : datePreset ? { date_preset: datePreset, date_column: activeDateColumn } : {}
            : {}),
        }
        const targetOrgId = user?.role === 'admin' ? organizationId ?? undefined : undefined
        const result = await api.analytics.getInsights(body, token, targetOrgId)
        setCache(insightsCache, insightsRequestKey, result)
        if (!cancelled) setInsights(result.insights)
      } catch (err) {
        if (!cancelled) {
          setInsights([])
          setInsightsError(err instanceof Error ? err.message : 'Failed to load AI insights')
        }
      } finally {
        if (!cancelled) setLoadingInsights(false)
      }
    }

    setInsights([])
    setInsightsError(null)
    const tid = window.setTimeout(() => { void load() }, 350)
    return () => { cancelled = true; window.clearTimeout(tid) }
  }, [session, activeDatasetId, insightsRequestKey, loadingAnalytics, datePreset, dateRange.start, dateRange.end, startDateValue, endDateValue, activeDateColumn, organizationId, user?.role])

  // ── ViewModel ─────────────────────────────────────────────────────────────

  const viewModel = useMemo(() => {
    const result = (analytics?.result ?? {}) as Record<string, unknown>
    const numericSummary = (result.numeric_summary ?? {}) as NumericSummary
    const numericTotals = (result.numeric_totals ?? {}) as NumericTotals
    const comparison = (result.comparison ?? {}) as MetricComparison
    const metricTimeSeries = (result.metric_time_series ?? {}) as MetricTimeSeries
    const metricBreakdowns = (result.metric_breakdowns ?? {}) as MetricBreakdowns
    const shape = (result.shape ?? null) as { rows: number; cols: number } | null

    const numericColumns = Object.keys(numericSummary)
    const storedMappings = activeDataset?.metric_mappings ?? {}
    const metricColumns = Object.fromEntries(
      metricDefinitions.map((def) => [
        def.key,
        storedMappings[def.key] ?? pickMetricColumn(numericColumns, def.patterns),
      ]),
    ) as Record<string, string | null>

    const getMetricValues = (key: string) => {
      const col = metricColumns[key]
      if (!col) return { current: null, previous: null }
      return {
        current: comparison[col]?.current ?? numericTotals[col] ?? null,
        previous: comparison[col]?.previous ?? null,
      }
    }

    const cards: MetricCardData[] = metricDefinitions.map((def) => {
      const column = metricColumns[def.key]
      let value: number | null = null
      let delta: number | null = null

      const isDerived = ['ctr', 'avg_cpc', 'roas'].includes(def.key)

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
        }

        if (currNum != null && currDen != null && currDen > 0) {
          value = def.key === 'ctr' ? (currNum / currDen) * 100 : currNum / currDen
        }
        if (prevNum != null && prevDen != null && prevDen > 0 && value != null) {
          const prev = def.key === 'ctr' ? (prevNum / prevDen) * 100 : prevNum / prevDen
          if (prev !== 0) delta = ((value - prev) / Math.abs(prev)) * 100
        }
      }

      const trendDirection: MetricCardData['trendDirection'] =
        delta == null || Math.abs(delta) < 0.05
          ? 'neutral'
          : INVERTED_TREND_KEYS.has(def.key)
            ? delta > 0 ? 'negative' : 'positive'
            : delta > 0 ? 'positive' : 'negative'

      return { key: def.key, label: def.label, value: formatMetricValue(def.kind, value), delta, trendDirection, tooltip: def.tooltip }
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
    const conversionsColumn = pickMetricColumn(numericColumns, [
      /\bconversion/i,
      /\bconversions\b/i,
      /\btransactions?\b/i,
      /\bpurchases?\b/i,
      /\borders?\b/i,
      /\bacquisitions?\b/i,
    ])
    const conversionsSeries = getSeriesForColumn(conversionsColumn)

    // Revenue vs Cost trend
    const trendData: TrendPoint[] = (() => {
      const map = new Map<string, TrendPoint>()
      revenueSeries.forEach((p) => { map.set(p.date, { ...map.get(p.date), date: p.date, revenue: p.value }) })
      costSeries.forEach((p) => { map.set(p.date, { ...map.get(p.date), date: p.date, cost: p.value }) })
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
    })()

    // Clicks vs CTR (compute CTR per date point)
    const clicksCtrData: ClicksCtrPoint[] = (() => {
      const clicksMap = new Map(clicksSeries.map((p) => [p.date, p.value]))
      const impressMap = new Map(impressionsSeries.map((p) => [p.date, p.value]))
      const dates = Array.from(new Set([...clicksMap.keys(), ...impressMap.keys()])).sort()
      return dates.map((date) => {
        const c = clicksMap.get(date)
        const i = impressMap.get(date)
        return {
          date,
          ...(c != null ? { clicks: c } : {}),
          ...(c != null && i != null && i > 0 ? { ctr: (c / i) * 100 } : {}),
        }
      })
    })()

    // ROAS trend (revenue / cost per date point)
    const roasData: RoasPoint[] = (() => {
      const revMap = new Map(revenueSeries.map((p) => [p.date, p.value]))
      const costMap = new Map(costSeries.map((p) => [p.date, p.value]))
      const dates = Array.from(new Set([...revMap.keys(), ...costMap.keys()])).sort()
      return dates.map((date) => {
        const r = revMap.get(date)
        const c = costMap.get(date)
        return {
          date,
          ...(r != null && c != null && c > 0 ? { roas: r / c } : {}),
        }
      })
    })()

    // Clicks vs Avg CPC (cost / clicks per date point)
    const clicksCpcData: ClicksCpcPoint[] = (() => {
      const clicksMap = new Map(clicksSeries.map((p) => [p.date, p.value]))
      const costMap = new Map(costSeries.map((p) => [p.date, p.value]))
      const dates = Array.from(new Set([...clicksMap.keys(), ...costMap.keys()])).sort()
      return dates.map((date) => {
        const c = clicksMap.get(date)
        const co = costMap.get(date)
        return {
          date,
          ...(c != null ? { clicks: c } : {}),
          ...(c != null && co != null && c > 0 ? { cpc: co / c } : {}),
        }
      })
    })()

    const transactionsCpaData: TransactionsCpaPoint[] = (() => {
      const convMap = new Map(conversionsSeries.map((p) => [p.date, p.value]))
      const costMap = new Map(costSeries.map((p) => [p.date, p.value]))
      const dates = Array.from(new Set([...convMap.keys(), ...costMap.keys()])).sort()
      return dates.map((date) => {
        const transactions = convMap.get(date)
        const cost = costMap.get(date)
        return {
          date,
          ...(transactions != null ? { transactions } : {}),
          ...(transactions != null && cost != null && transactions > 0 ? { cpa: cost / transactions } : {}),
        }
      })
    })()

    const conversionRateData: ConversionRatePoint[] = (() => {
      const convMap = new Map(conversionsSeries.map((p) => [p.date, p.value]))
      const clicksMap = new Map(clicksSeries.map((p) => [p.date, p.value]))
      const dates = Array.from(new Set([...convMap.keys(), ...clicksMap.keys()])).sort()
      return dates.map((date) => {
        const conversions = convMap.get(date)
        const clicks = clicksMap.get(date)
        return {
          date,
          ...(conversions != null && clicks != null && clicks > 0 ? { conversionRate: (conversions / clicks) * 100 } : {}),
        }
      })
    })()

    const revenueDistribution: RevenueSplitDatum[] = (() => {
      const revenueColumn = metricColumns.revenue
      if (!revenueColumn) return []
      const breakdowns = metricBreakdowns[revenueColumn] ?? {}

      const candidate = Object.entries(breakdowns).find(([, categories]) =>
        Object.keys(categories).some((name) => /store|delivery|pickup|ship/i.test(name)),
      )
      if (!candidate) return []

      const [, categories] = candidate
      let inStore = 0
      let delivery = 0

      for (const [name, value] of Object.entries(categories)) {
        if (/delivery|ship/i.test(name)) delivery += value
        else if (/store|pickup|walk/i.test(name)) inStore += value
      }

      const data: RevenueSplitDatum[] = []
      if (inStore > 0) data.push({ name: 'In-Store', value: inStore, color: '#f2c84b' })
      if (delivery > 0) data.push({ name: 'Delivery', value: delivery, color: '#69d18a' })
      return data
    })()

    // ── Campaign Breakdown ───────────────────────────────────────────────────
    const campaignRows: CampaignRow[] = (() => {
      // Pick a campaign-like dimension from available breakdowns
      const allBreakdownCols = Object.values(metricBreakdowns)
        .flatMap((byCat) => Object.keys(byCat))
      const campaignDimension = allBreakdownCols.find((col) =>
        CAMPAIGN_PATTERNS.some((p) => p.test(col)),
      )
      if (!campaignDimension) return []

      const getBreakdown = (metricKey: string): Record<string, number> => {
        const col = metricColumns[metricKey]
        if (!col) return {}
        return metricBreakdowns[col]?.[campaignDimension] ?? {}
      }

      const impBreakdown = getBreakdown('impressions')
      const clkBreakdown = getBreakdown('clicks')
      const costBreakdown = getBreakdown('cost')
      const revBreakdown = getBreakdown('revenue')
      const convBreakdown = conversionsColumn ? (metricBreakdowns[conversionsColumn]?.[campaignDimension] ?? {}) : {}

      const campaigns = Array.from(new Set([
        ...Object.keys(impBreakdown),
        ...Object.keys(clkBreakdown),
        ...Object.keys(costBreakdown),
        ...Object.keys(revBreakdown),
        ...Object.keys(convBreakdown),
      ]))

      return campaigns
        .map((name) => {
          const impr = impBreakdown[name] ?? null
          const clicks = clkBreakdown[name] ?? null
          const cost = costBreakdown[name] ?? null
          const revenue = revBreakdown[name] ?? null
          const conversions = convBreakdown[name] ?? null
          return {
            name,
            impressions: impr,
            clicks,
            cost,
            revenue,
            conversions,
            ctr: clicks != null && impr != null && impr > 0 ? (clicks / impr) * 100 : null,
            cpc: cost != null && clicks != null && clicks > 0 ? cost / clicks : null,
            roas: revenue != null && cost != null && cost > 0 ? revenue / cost : null,
          }
        })
        .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
    })()

    // ── Daily Performance (last 14 date periods) ─────────────────────────────
    const dailyRows: DailyRow[] = (() => {
      if (!firstDateKey) return []
      const seriesGroup = metricTimeSeries[firstDateKey]
      if (!seriesGroup) return []

      const getMap = (col: string | null) =>
        col && seriesGroup[col]
          ? new Map(seriesGroup[col].map((p) => [p.date, p.value]))
          : new Map<string, number>()

      const impressMap = getMap(metricColumns.impressions)
      const clicksMap = getMap(metricColumns.clicks)
      const costMap = getMap(metricColumns.cost)
      const revMap = getMap(metricColumns.revenue)
      const convMap = getMap(conversionsColumn)

      const dates = Array.from(
        new Set([...impressMap.keys(), ...clicksMap.keys(), ...costMap.keys(), ...revMap.keys(), ...convMap.keys()]),
      )
        .sort()
        .reverse()
        .slice(0, 14)

      return dates.map((date) => {
        const impr = impressMap.get(date) ?? null
        const clicks = clicksMap.get(date) ?? null
        const cost = costMap.get(date) ?? null
        const revenue = revMap.get(date) ?? null
        const conversions = convMap.get(date) ?? null
        return {
          date,
          impressions: impr,
          clicks,
          cost,
          revenue,
          conversions,
          ctr: clicks != null && impr != null && impr > 0 ? (clicks / impr) * 100 : null,
          cpc: cost != null && clicks != null && clicks > 0 ? cost / clicks : null,
          roas: revenue != null && cost != null && cost > 0 ? revenue / cost : null,
        }
      })
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
    }
  }, [analytics, activeDataset])

  const sectionInsights = useMemo(() => getInsightChunks(insights), [insights])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-[#fcfaf7]">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#e7e1d6] bg-white px-8 py-6">
        <div>
          <p className="mb-1 text-[0.8rem] font-bold tracking-[0.1em] text-[#8a93a5] uppercase">
            {activeOrganizationName}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[#252b36]">{channelName} Performance</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          </div>
          <p className="mt-1 text-sm text-[#8a93a5]">
            {getChannelSubtitle(channelName)}
            {lastUpdated && (
              <span className="ml-2 text-[#b0b7c5]">· Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Dataset selector */}
          {loadingDatasets ? (
            <div className="shimmer-warm h-[42px] w-[200px] rounded-[1rem] border border-[#e5dfd6]" />
          ) : completedDatasets.length > 0 ? (
            <select
              id="report-selector"
              value={activeDatasetId ?? ''}
              onChange={(e) => setActiveDatasetId(e.target.value || null)}
              className="h-[42px] w-[220px] appearance-none rounded-[1rem] border border-[#e5dfd6] bg-white px-4 pr-10 text-[0.95rem] font-medium text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition hover:border-[#f0a500]/50 focus:border-[#f0a500]/50"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%237c8493'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.8rem center',
                backgroundSize: '1.2rem',
                textOverflow: 'ellipsis',
              }}
            >
              {completedDatasets.map((d) => (
                <option key={d.id} value={d.id}>{d.report_name || d.file_name}</option>
              ))}
            </select>
          ) : null}
          <DateFilter />
        </div>
      </header>

      <div className="space-y-8 px-8 py-8 animate-fade-in">

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

      {!loadingDatasets && completedDatasets.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card text-center card-shadow">
          <Database className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-base font-semibold">No {channelName} reports yet</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Ask your admin to upload a {channelName} CSV dataset to populate this section.
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ────────────────────────────────────────────────── */}
          {loadingAnalytics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <KPICard key={i} title="" value="" loading />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4 stagger-children">
              {viewModel.cards.map((card) => (
                <KPICard
                  key={card.key}
                  title={card.label}
                  value={card.value}
                  trendValue={card.delta}
                  trendDirection={card.trendDirection}
                  tooltip={card.tooltip}
                />
              ))}
            </div>
          )}

            {/* ── Traffic Performance ─────────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold">Traffic Performance</h2>

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
                  >
                    <DualAxisComboChart
                      data={viewModel.clicksCtrData as Record<string, unknown>[]}
                      series={[
                        { type: 'bar',  dataKey: 'clicks', name: 'Clicks', color: accentColor, axis: 'l' },
                        { type: 'line', dataKey: 'ctr',    name: 'CTR %',  color: '#f5b800',   axis: 'r' },
                      ]}
                      leftTickFormatter={(v) => formatCompactNumber(v)}
                      rightTickFormatter={(v) => `${v.toFixed(1)}%`}
                      tooltipFormatter={(v, n) =>
                        n === 'CTR %' ? [`${v.toFixed(2)}%`, n] : [formatCompactNumber(v), n]
                      }
                    />
                  </ChartCard>

                  <ChartCard
                    title="Clicks vs Avg CPC"
                    empty={viewModel.clicksCpcData.length === 0}
                    emptyMsg="Need a date column plus clicks and cost columns to draw this chart."
                  >
                    <DualAxisComboChart
                      data={viewModel.clicksCpcData as Record<string, unknown>[]}
                      series={[
                        { type: 'bar',  dataKey: 'clicks', name: 'Clicks',   color: accentColor, axis: 'l' },
                        { type: 'line', dataKey: 'cpc',    name: 'Avg CPC $', color: '#f97316',   axis: 'r' },
                      ]}
                      leftTickFormatter={(v) => formatCompactNumber(v)}
                      rightTickFormatter={(v) => `$${v.toFixed(2)}`}
                      tooltipFormatter={(v, n) =>
                        n === 'Avg CPC $' ? [formatCurrency(v), n] : [formatCompactNumber(v), n]
                      }
                    />
                  </ChartCard>
                </div>
              )}
            </section>

            <OverallInsights
              insights={sectionInsights.traffic}
              loading={loadingInsights}
              error={insightsError}
              title="Traffic Insights"
            />

            <section className="space-y-4">
              <h2 className="text-lg font-bold">Conversion Performance</h2>

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
                    empty={viewModel.transactionsCpaData.length === 0}
                    emptyMsg="Need conversions and cost data with a date column to draw this chart."
                  >
                    <DualAxisComboChart
                      data={viewModel.transactionsCpaData as Record<string, unknown>[]}
                      series={[
                        { type: 'bar', dataKey: 'transactions', name: 'Transactions', color: accentColor, axis: 'l' },
                        { type: 'line', dataKey: 'cpa', name: 'CPA $', color: '#f5b800', axis: 'r' },
                      ]}
                      leftTickFormatter={(v) => formatCompactNumber(v)}
                      rightTickFormatter={(v) => `$${v.toFixed(0)}`}
                      tooltipFormatter={(v, n) => (n === 'CPA $' ? [formatCurrency(v), n] : [formatCompactNumber(v), n])}
                    />
                  </ChartCard>

                  <ChartCard
                    title="Conversion Rate Trend"
                    empty={viewModel.conversionRateData.filter((p) => p.conversionRate != null).length === 0}
                    emptyMsg="Need conversions and clicks data with a date column to compute conversion rate."
                  >
                    <AreaTrendChart
                      data={viewModel.conversionRateData as Record<string, unknown>[]}
                      series={[
                        {
                          type: 'area',
                          dataKey: 'conversionRate',
                          name: 'Conversion Rate',
                          color: accentColor,
                          gradientId: `conversion-rate-${reportType}`,
                          gradientOpacity: 0.18,
                        },
                      ]}
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      tooltipFormatter={(v) => `${v.toFixed(2)}%`}
                    />
                  </ChartCard>
                </div>
              )}
            </section>

            <OverallInsights
              insights={sectionInsights.conversion}
              loading={loadingInsights}
              error={insightsError}
              title="Conversion Insights"
            />

            {/* ── Revenue Performance ─────────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold">Revenue Performance</h2>

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
                  >
                    <AreaTrendChart
                      data={viewModel.trendData as Record<string, unknown>[]}
                      series={[
                        { type: 'area', dataKey: 'revenue', name: 'Revenue', color: '#f5b800', gradientId: `rev-${reportType}` },
                        { type: 'area', dataKey: 'cost',    name: 'Cost',    color: '#f97316', gradientId: `cost-${reportType}`, gradientOpacity: 0.16 },
                      ]}
                      tickFormatter={(v) => `$${Math.round(v)}`}
                      tooltipFormatter={(v) => formatCurrency(v)}
                    />
                  </ChartCard>

                  <ChartCard
                    title="ROAS Trend"
                    empty={viewModel.roasData.filter((p) => p.roas != null).length === 0}
                    emptyMsg="Need revenue and cost columns with a date column to compute ROAS trend."
                  >
                    <AreaTrendChart
                      data={viewModel.roasData as Record<string, unknown>[]}
                      series={[
                        { type: 'area', dataKey: 'roas', name: 'ROAS', color: accentColor, gradientId: `roas-${reportType}`, gradientOpacity: 0.2 },
                      ]}
                      tickFormatter={(v) => `${v.toFixed(1)}x`}
                      tooltipFormatter={(v) => `${v.toFixed(2)}x`}
                    />
                  </ChartCard>
                </div>
              )}
            </section>

            <OverallInsights
              insights={sectionInsights.revenue}
              loading={loadingInsights}
              error={insightsError}
              title="Revenue Insights"
            />

            <section className="space-y-4">
              <h2 className="text-lg font-bold">Revenue Distribution</h2>
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                <ChartCard
                  title="In-Store vs Delivery Revenue"
                  empty={viewModel.revenueDistribution.length === 0}
                  emptyMsg="Need a revenue breakdown with in-store and delivery categories to draw this chart."
                >
                  <DistributionChart data={viewModel.revenueDistribution} />
                </ChartCard>

                <OverallInsights
                  insights={sectionInsights.distribution}
                  loading={loadingInsights}
                  error={insightsError}
                  title="Distribution Insights"
                />
              </div>
            </section>


            {/* ── Campaign Breakdown table ─────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold">Campaign Breakdown</h2>
              <div className="rounded-xl border border-border bg-card card-shadow overflow-x-auto">
                {viewModel.campaignRows.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                    No campaign dimension found. Add a &quot;Campaign&quot; or &quot;Ad Set&quot; column to enable this breakdown.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        {['Campaign', 'Impressions', 'Clicks', 'CTR', 'Avg CPC', 'Cost', 'Conv.', 'Revenue', 'ROAS'].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase ${h === 'Campaign' ? 'text-left' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewModel.campaignRows.map((row, i) => (
                        <tr
                          key={row.name}
                          className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${i === 0 ? 'bg-primary/5' : ''}`}
                        >
                          <td className="max-w-[180px] truncate px-4 py-3 font-medium" title={row.name}>
                            {row.name}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.impressions)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.clicks)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtPct(row.ctr)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.cpc)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.cost)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtN(row.conversions)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtCur(row.revenue)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${
                            row.roas == null ? 'text-muted-foreground' : row.roas >= 2 ? 'text-emerald-600' : row.roas < 1 ? 'text-red-500' : 'text-amber-500'
                          }`}>
                            {fmtX(row.roas)}
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
              <h2 className="text-lg font-bold">Daily Performance</h2>
              <div className="rounded-xl border border-border bg-card card-shadow overflow-x-auto">
                {viewModel.dailyRows.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                    No daily data available. Upload a dataset with a date column to enable this table.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        {['Date', 'Impr.', 'Clicks', 'CTR', 'CPC', 'Cost', 'Conv.', 'Revenue', 'ROAS'].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase ${h === 'Date' ? 'text-left' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewModel.dailyRows.map((row) => (
                        <tr
                          key={row.date}
                          className="border-b border-border/50 transition-colors hover:bg-muted/30"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {(() => {
                              try {
                                return new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
                          <td className={`px-4 py-3 text-right font-semibold ${
                            row.roas == null ? 'text-muted-foreground' : row.roas >= 2 ? 'text-emerald-600' : row.roas < 1 ? 'text-red-500' : 'text-amber-500'
                          }`}>
                            {fmtX(row.roas)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

          </>
        )}
      </div>
    </div>
  )
}
