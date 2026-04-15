import type { AIInsight } from '@/types'

type SectionInsights = {
  traffic: AIInsight[]
  conversion: AIInsight[]
  revenue: AIInsight[]
  distribution: AIInsight[]
}

export function splitInsightsBySection(insights: AIInsight[]): SectionInsights {
  return {
    traffic: insights[0] ? [insights[0]] : [],
    conversion: insights[1] ? [insights[1]] : [],
    revenue: insights[2] ? [insights[2]] : [],
    distribution: insights[3] ? [insights[3]] : [],
  }
}
