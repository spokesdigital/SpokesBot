type MetricMappings = Record<string, string | null>

type DateBounds = {
  startDate?: string | null
  endDate?: string | null
}

export type MetricSeriesPoint = {
  date: string
  value: number
}

export type TransactionsCpaPoint = {
  date: string
  transactions?: number
  cpa?: number
}

export type ConversionRatePoint = {
  date: string
  conversionRate?: number
}

function getSortedDates(...seriesMaps: Array<Map<string, number>>) {
  return Array.from(new Set(seriesMaps.flatMap((seriesMap) => [...seriesMap.keys()]))).sort()
}

function isValidDateKey(value: string | null | undefined): value is string {
  if (!value) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
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

export function pickConversionsColumn(metricMappings: MetricMappings, numericColumns: string[]) {
  const mappedColumn = metricMappings.conversions
  if (mappedColumn && numericColumns.includes(mappedColumn)) return mappedColumn
  return null
}

export function buildTransactionsCpaData(
  conversionsSeries: MetricSeriesPoint[],
  costSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
): TransactionsCpaPoint[] {
  if (conversionsSeries.length === 0 || costSeries.length === 0) return []

  const convMap = new Map(conversionsSeries.map((point) => [point.date, point.value]))
  const costMap = new Map(costSeries.map((point) => [point.date, point.value]))
  const dates = buildContinuousDateRange(getSortedDates(convMap, costMap), bounds)

  return dates.map((date): TransactionsCpaPoint => {
    const transactions = convMap.get(date) ?? 0
    const cost = costMap.get(date)

    const result: TransactionsCpaPoint = {
      date,
      transactions,
    }

    if (transactions > 0 && cost != null) {
      result.cpa = cost / transactions
    }

     return result
   })
 }

 export function buildConversionRateData(
  conversionsSeries: MetricSeriesPoint[],
  clicksSeries: MetricSeriesPoint[],
  bounds?: DateBounds,
): ConversionRatePoint[] {
  const convMap = new Map(conversionsSeries.map((point) => [point.date, point.value]))
  const clicksMap = new Map(clicksSeries.map((point) => [point.date, point.value]))
  const dates = buildContinuousDateRange(getSortedDates(convMap, clicksMap), bounds)

  return dates.map((date) => {
    const conversions = convMap.get(date)
    const clicks = clicksMap.get(date)

    return {
      date,
      ...((conversions != null && clicks != null && clicks > 0)
        ? { conversionRate: (conversions / clicks) * 100 }
        : {}),
    }
  })
}

export function hasTransactionsOrCpaData(data: TransactionsCpaPoint[]) {
  return data.some((point) => (point.transactions ?? 0) > 0 || point.cpa != null)
}

export function hasConversionRateData(data: ConversionRatePoint[]) {
  return data.some((point) => point.conversionRate != null)
}
