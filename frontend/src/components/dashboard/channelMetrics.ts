import {
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns'

type MetricMappings = Record<string, string | null>

export type DateBounds = {
  startDate?: string | null
  endDate?: string | null
}

export type ChartBucket = 'day' | 'week' | 'month'

type LabeledPoint = {
  date: string
  label: string
  tooltipLabel: string
}

export type MetricSeriesPoint = {
  date: string
  value: number
}

export type TransactionsCpaPoint = LabeledPoint & {
  transactions?: number
  cpa?: number
}

export type ConversionRatePoint = LabeledPoint & {
  conversionRate?: number
}

export type TrendPoint = LabeledPoint & {
  revenue?: number
  cost?: number
}

export type ClicksCtrPoint = LabeledPoint & {
  clicks?: number
  ctr?: number
}

export type ClicksCpcPoint = LabeledPoint & {
  clicks?: number
  cpc?: number
}

export type RoasPoint = LabeledPoint & {
  roas?: number
}

function getSortedDates(...seriesMaps: Array<Map<string, number>>) {
  return Array.from(new Set(seriesMaps.flatMap((seriesMap) => [...seriesMap.keys()]))).sort()
}

function isValidDateKey(value: string | null | undefined): value is string {
  if (!value) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day))
}

function buildContinuousDateRange(dates: string[], bounds?: DateBounds) {
  const firstDate = bounds?.startDate ?? dates[0]
  const lastDate = bounds?.endDate ?? dates[dates.length - 1]

  if (!isValidDateKey(firstDate) || !isValidDateKey(lastDate) || firstDate > lastDate) {
    return dates
  }

  const range: string[] = []
  const cursor = new Date(`${firstDate}T00:00:00Z`)
  const end = new Date(`${lastDate}T00:00:00Z`)

  while (cursor <= end) {
    range.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return range
}

function getBucketStart(date: Date, bucket: ChartBucket) {
  if (bucket === 'month') {
    return createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), 1)
  }
  if (bucket === 'week') {
    const weekdayOffset = (date.getUTCDay() + 6) % 7
    return createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - weekdayOffset)
  }
  return date
}

function addBucket(date: Date, bucket: ChartBucket) {
  if (bucket === 'month') return createUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  if (bucket === 'week') return createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 7)
  return createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

function formatBucketKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatBucketAxisLabel(date: Date, bucket: ChartBucket) {
  if (bucket === 'month') return format(date, 'MMM yyyy')
  if (bucket === 'week') return format(date, 'MMM d')
  return format(date, 'MMM d')
}

function formatBucketTooltipLabel(date: Date, bucket: ChartBucket) {
  if (bucket === 'month') return format(date, 'MMMM yyyy')
  if (bucket === 'week') return `Week of ${format(date, 'MMM d, yyyy')}`
  return format(date, 'MMM d, yyyy')
}

function buildBucketRange(dates: string[], bounds: DateBounds | undefined, bucket: ChartBucket) {
  const firstDate = bounds?.startDate ?? dates[0]
  const lastDate = bounds?.endDate ?? dates[dates.length - 1]

  if (!isValidDateKey(firstDate) || !isValidDateKey(lastDate) || firstDate > lastDate) {
    return dates
  }

  const range: string[] = []
  let cursor = getBucketStart(parseDateKey(firstDate), bucket)
  const end = parseDateKey(lastDate)

  while (cursor <= end) {
    range.push(formatBucketKey(cursor))
    cursor = addBucket(cursor, bucket)
  }

  return range
}

function aggregateSeriesByBucket(series: MetricSeriesPoint[], bucket: ChartBucket) {
  const bucketMap = new Map<string, number>()

  series.forEach((point) => {
    if (!isValidDateKey(point.date)) return
    const bucketKey = formatBucketKey(getBucketStart(parseDateKey(point.date), bucket))
    bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + point.value)
  })

  return bucketMap
}

function buildBucketMetadata(bucketKey: string, bucket: ChartBucket): LabeledPoint {
  const date = parseDateKey(bucketKey)
  return {
    date: bucketKey,
    label: formatBucketAxisLabel(date, bucket),
    tooltipLabel: formatBucketTooltipLabel(date, bucket),
  }
}

function buildBucketRows(
  seriesMap: Record<string, MetricSeriesPoint[]>,
  bucket: ChartBucket,
  bounds?: DateBounds,
) {
  const allDates = Object.values(seriesMap).flatMap((series) => series.map((point) => point.date))
  if (allDates.length === 0) return []

  const bucketKeys = bucket === 'day'
    ? buildContinuousDateRange(allDates, bounds)
    : buildBucketRange(allDates, bounds, bucket)
  const aggregatedSeries = Object.fromEntries(
    Object.entries(seriesMap).map(([key, series]) => [key, aggregateSeriesByBucket(series, bucket)]),
  )

  return bucketKeys.map((bucketKey) => {
    const row: Record<string, number | string> = buildBucketMetadata(bucketKey, bucket)
    Object.entries(aggregatedSeries).forEach(([key, valueMap]) => {
      row[key] = valueMap.get(bucketKey) ?? 0
    })
    return row
  })
}

export function resolveChartBucket(
  datePreset?: string | null,
  bounds?: DateBounds,
  dates: string[] = [],
): ChartBucket {
  if (datePreset === 'today' || datePreset === 'yesterday' || datePreset === 'last_7_days') {
    return 'day'
  }
  if (datePreset === 'last_30_days' || datePreset === 'this_month') {
    return 'day'
  }
  if (datePreset === 'ytd') {
    return 'month'
  }

  const firstDate = bounds?.startDate ?? dates[0]
  const lastDate = bounds?.endDate ?? dates[dates.length - 1]
  if (!isValidDateKey(firstDate) || !isValidDateKey(lastDate) || firstDate > lastDate) {
    return 'day'
  }

  const totalDays = differenceInCalendarDays(parseDateKey(lastDate), parseDateKey(firstDate)) + 1
  if (totalDays > 180) return 'month'
  if (totalDays > 60) return 'week'
  return 'day'
}

export function pickConversionsColumn(metricMappings: MetricMappings, numericColumns: string[]) {
  const mappedColumn = metricMappings.conversions
  if (mappedColumn && numericColumns.includes(mappedColumn)) return mappedColumn
  return null
}

export function buildRevenueCostTrendData(
  revenueSeries: MetricSeriesPoint[],
  costSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
  datePreset?: string | null,
): TrendPoint[] {
  if (revenueSeries.length === 0 && costSeries.length === 0) return []

  const bucket = resolveChartBucket(
    datePreset,
    bounds,
    [...revenueSeries.map((point) => point.date), ...costSeries.map((point) => point.date)],
  )

  return buildBucketRows({ revenue: revenueSeries, cost: costSeries }, bucket, bounds).map((row) => ({
    date: String(row.date),
    label: String(row.label),
    tooltipLabel: String(row.tooltipLabel),
    revenue: Number(row.revenue ?? 0),
    cost: Number(row.cost ?? 0),
  }))
}

export function buildClicksCtrData(
  clicksSeries: MetricSeriesPoint[],
  impressionsSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
  datePreset?: string | null,
): ClicksCtrPoint[] {
  if (clicksSeries.length === 0 && impressionsSeries.length === 0) return []

  const bucket = resolveChartBucket(
    datePreset,
    bounds,
    [...clicksSeries.map((point) => point.date), ...impressionsSeries.map((point) => point.date)],
  )

  return buildBucketRows({ clicks: clicksSeries, impressions: impressionsSeries }, bucket, bounds).map((row) => {
    const clicks = Number(row.clicks ?? 0)
    const impressions = Number(row.impressions ?? 0)

    return {
      date: String(row.date),
      label: String(row.label),
      tooltipLabel: String(row.tooltipLabel),
      clicks,
      ...(clicks > 0 && impressions > 0 ? { ctr: (clicks / impressions) * 100 } : {}),
    }
  })
}

export function buildClicksCpcData(
  clicksSeries: MetricSeriesPoint[],
  costSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
  datePreset?: string | null,
): ClicksCpcPoint[] {
  if (clicksSeries.length === 0 && costSeries.length === 0) return []

  const bucket = resolveChartBucket(
    datePreset,
    bounds,
    [...clicksSeries.map((point) => point.date), ...costSeries.map((point) => point.date)],
  )

  return buildBucketRows({ clicks: clicksSeries, cost: costSeries }, bucket, bounds).map((row) => {
    const clicks = Number(row.clicks ?? 0)
    const cost = Number(row.cost ?? 0)

    return {
      date: String(row.date),
      label: String(row.label),
      tooltipLabel: String(row.tooltipLabel),
      clicks,
      ...(clicks > 0 ? { cpc: cost / clicks } : {}),
    }
  })
}

export function buildRoasData(
  revenueSeries: MetricSeriesPoint[],
  costSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
  datePreset?: string | null,
): RoasPoint[] {
  if (revenueSeries.length === 0 && costSeries.length === 0) return []

  const bucket = resolveChartBucket(
    datePreset,
    bounds,
    [...revenueSeries.map((point) => point.date), ...costSeries.map((point) => point.date)],
  )

  return buildBucketRows({ revenue: revenueSeries, cost: costSeries }, bucket, bounds).map((row) => {
    const revenue = Number(row.revenue ?? 0)
    const cost = Number(row.cost ?? 0)

    return {
      date: String(row.date),
      label: String(row.label),
      tooltipLabel: String(row.tooltipLabel),
      ...(cost > 0 ? { roas: revenue / cost } : {}),
    }
  })
}

export function buildTransactionsCpaData(
  conversionsSeries: MetricSeriesPoint[],
  costSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
  datePreset?: string | null,
): TransactionsCpaPoint[] {
  if (conversionsSeries.length === 0 || costSeries.length === 0) return []

  const bucket = resolveChartBucket(
    datePreset,
    bounds,
    [...conversionsSeries.map((point) => point.date), ...costSeries.map((point) => point.date)],
  )

  return buildBucketRows({ conversions: conversionsSeries, cost: costSeries }, bucket, bounds).map((row) => {
    const transactions = Number(row.conversions ?? 0)
    const cost = Number(row.cost ?? 0)

    const result: TransactionsCpaPoint = {
      date: String(row.date),
      label: String(row.label),
      tooltipLabel: String(row.tooltipLabel),
      transactions,
    }

    if (transactions > 0) {
      result.cpa = cost / transactions
    }

    return result
  })
}

export function buildConversionRateData(
  conversionsSeries: MetricSeriesPoint[],
  clicksSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
  datePreset?: string | null,
): ConversionRatePoint[] {
  if (conversionsSeries.length === 0 && clicksSeries.length === 0) return []

  const bucket = resolveChartBucket(
    datePreset,
    bounds,
    [...conversionsSeries.map((point) => point.date), ...clicksSeries.map((point) => point.date)],
  )

  return buildBucketRows({ conversions: conversionsSeries, clicks: clicksSeries }, bucket, bounds).map((row) => {
    const conversions = Number(row.conversions ?? 0)
    const clicks = Number(row.clicks ?? 0)

    return {
      date: String(row.date),
      label: String(row.label),
      tooltipLabel: String(row.tooltipLabel),
      ...(clicks > 0 ? { conversionRate: (conversions / clicks) * 100 } : {}),
    }
  })
}

export function hasTransactionsOrCpaData(data: TransactionsCpaPoint[]) {
  return data.some((point) => (point.transactions ?? 0) > 0 || point.cpa != null)
}

export function hasConversionRateData(data: ConversionRatePoint[]) {
  return data.some((point) => point.conversionRate != null)
}

export type ComparisonWindow = {
  previous_start: string
  previous_end: string
}

export function buildPriorLabel(comparisonWindow: ComparisonWindow | null): string {
  if (!comparisonWindow) return 'prior period'
  try {
    const fmt = (iso: string) => format(parseISO(iso), 'MMM d')
    return `${fmt(comparisonWindow.previous_start)} – ${fmt(comparisonWindow.previous_end)}`
  } catch {
    return 'prior period'
  }
}

export function buildNoDataLabel(comparisonAttempted: boolean, priorLabel: string): string {
  return comparisonAttempted ? `No data: ${priorLabel}` : 'Select a date range to compare'
}
