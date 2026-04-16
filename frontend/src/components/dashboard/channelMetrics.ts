type MetricMappings = Record<string, string | null>

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

const CONVERSION_COUNT_PATTERNS = [
  /\bconversions?\b/i,
  /\btransactions?\b/i,
  /\bpurchases?\b/i,
  /\borders?\b/i,
  /\bacquisitions?\b/i,
  /\bleads?\b/i,
]

const NON_COUNT_CONVERSION_PATTERNS = [
  /\brate\b/i,
  /\bcvr\b/i,
  /\bctr\b/i,
  /\bcpa\b/i,
  /\bcpc\b/i,
  /\bcpm\b/i,
  /\broas\b/i,
  /cost[\s_-]*per/i,
  /value/i,
  /revenue/i,
]

function conversionColumnScore(column: string) {
  const normalized = column.trim().toLowerCase()

  if (/^conversions?$/.test(normalized)) return 0
  if (/^transactions?$/.test(normalized)) return 1
  if (/^purchases?$/.test(normalized)) return 2
  if (/^orders?$/.test(normalized)) return 3
  if (/^acquisitions?$/.test(normalized)) return 4
  if (/^leads?$/.test(normalized)) return 5
  if (/\bconversions?\b/.test(normalized)) return 10
  if (/\btransactions?\b/.test(normalized)) return 11
  if (/\bpurchases?\b/.test(normalized)) return 12
  if (/\borders?\b/.test(normalized)) return 13
  if (/\bacquisitions?\b/.test(normalized)) return 14
  if (/\bleads?\b/.test(normalized)) return 15
  return 99
}

function getSortedDates(...seriesMaps: Array<Map<string, number>>) {
  return Array.from(new Set(seriesMaps.flatMap((seriesMap) => [...seriesMap.keys()]))).sort()
}

export function pickConversionsColumn(metricMappings: MetricMappings, numericColumns: string[]) {
  const mappedColumn = metricMappings.conversions
  if (mappedColumn && numericColumns.includes(mappedColumn)) return mappedColumn

  const candidates = numericColumns
    .filter((column) => CONVERSION_COUNT_PATTERNS.some((pattern) => pattern.test(column)))
    .filter((column) => !NON_COUNT_CONVERSION_PATTERNS.some((pattern) => pattern.test(column)))

  if (candidates.length === 0) return null

  return [...candidates].sort((a, b) => conversionColumnScore(a) - conversionColumnScore(b) || a.localeCompare(b))[0]
}

export function buildTransactionsCpaData(
  conversionsSeries: MetricSeriesPoint[],
  costSeries: MetricSeriesPoint[],
): TransactionsCpaPoint[] {
  const convMap = new Map(conversionsSeries.map((point) => [point.date, point.value]))
  const costMap = new Map(costSeries.map((point) => [point.date, point.value]))
  const dates = getSortedDates(convMap, costMap)

  return dates.map((date) => {
    const transactions = convMap.get(date) ?? 0
    const cost = costMap.get(date)

    return {
      date,
      transactions,
      ...(transactions > 0 && cost != null ? { cpa: cost / transactions } : {}),
    }
  })
}

export function buildConversionRateData(
  conversionsSeries: MetricSeriesPoint[],
  clicksSeries: MetricSeriesPoint[],
): ConversionRatePoint[] {
  const convMap = new Map(conversionsSeries.map((point) => [point.date, point.value]))
  const clicksMap = new Map(clicksSeries.map((point) => [point.date, point.value]))
  const dates = getSortedDates(convMap, clicksMap)

  return dates.map((date) => {
    const conversions = convMap.get(date)
    const clicks = clicksMap.get(date)

    return {
      date,
      ...(conversions != null && clicks != null && clicks > 0 ? { conversionRate: (conversions / clicks) * 100 } : {}),
    }
  })
}

export function hasTransactionsOrCpaData(data: TransactionsCpaPoint[]) {
  return data.some((point) => point.transactions != null || point.cpa != null)
}

export function hasConversionRateData(data: ConversionRatePoint[]) {
  return data.some((point) => point.conversionRate != null)
}
