'use client'

import { CheckCircle, Lightbulb, RefreshCw, TrendingUp } from 'lucide-react'
import type { AIInsight } from '@/types'

interface OverallInsightsProps {
  insights: AIInsight[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  title?: string
  subtitle?: string | null
  emptyMessage?: string
}

function friendlyInsightError(error: string): string {
  if (error.includes('timed out') || error.includes('408')) {
    return 'AI insight generation took too long. This can happen with large datasets — click Retry to try again.'
  }
  if (error.includes('503') || error.includes('AI service error') || error.includes('OpenAI')) {
    return 'The AI service is temporarily unavailable. Please try again in a moment.'
  }
  if (error.includes('parsing issues') || error.includes('data quality')) {
    return error // This one is already user-friendly from the existing code
  }
  if (error.includes('404') || error.includes('not found')) {
    return 'Dataset not found. Please re-select your dataset and try again.'
  }
  return 'AI insights could not be generated right now. Please try again.'
}

const insightConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  trend:   { icon: TrendingUp,  color: 'text-blue-500',    bg: 'bg-blue-500/10'    },
}

const fallbackInsightConfig = { icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10' }

export function OverallInsights({
  insights,
  loading = false,
  error = null,
  onRetry,
  title = 'AI Insights',
  subtitle,
  emptyMessage = 'Insights will appear once the active dataset is ready for AI analysis.',
}: OverallInsightsProps) {
  return (
    <div className="bg-gradient-to-br from-card to-muted/30 rounded-xl p-5 card-shadow border border-border">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Lightbulb className="w-4 h-4 text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full shrink-0">
          AI-Powered
        </span>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-4 h-4 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
          </span>
          Positive result
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-4 h-4 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-2.5 h-2.5 text-blue-500" />
          </span>
          Notable trend
        </span>
      </div>

      {/* Insight items */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shimmer-warm h-14 rounded-lg" />
          ))
        ) : error ? (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-start gap-2">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1 min-w-0">
              <p>{friendlyInsightError(error)}</p>
              {onRetry && !error.includes('parsing issues') && (
                <button
                  onClick={onRetry}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : insights.length > 0 ? (
          insights.slice(0, 4).map((insight, i) => {
            const { icon: Icon, color, bg } = insightConfig[insight.type] ?? fallbackInsightConfig
            return (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/50">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{insight.text}</p>
              </div>
            )
          })
        ) : (
          <div className="p-3 rounded-lg bg-background/60 border border-border/50 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  )
}
