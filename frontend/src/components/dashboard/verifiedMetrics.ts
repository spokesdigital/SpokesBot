type MetricMappings = Record<string, string | null | undefined>

type MetricDefinition = {
  key: string
}

export function getVerifiedMetricColumn(
  metricKey: string,
  metricMappings: MetricMappings,
  numericColumns: string[],
) {
  const mappedColumn = metricMappings[metricKey]
  if (!mappedColumn) return null
  return numericColumns.includes(mappedColumn) ? mappedColumn : null
}

export function getVerifiedMetricColumns(
  definitions: MetricDefinition[],
  metricMappings: MetricMappings,
  numericColumns: string[],
) {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.key,
      getVerifiedMetricColumn(definition.key, metricMappings, numericColumns),
    ]),
  ) as Record<string, string | null>
}

export function getAnalyticsDataQualityWarnings(result: Record<string, unknown> | null | undefined) {
  const rawWarnings = result?.data_quality_warnings
  if (!Array.isArray(rawWarnings)) return []

  return rawWarnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
}
