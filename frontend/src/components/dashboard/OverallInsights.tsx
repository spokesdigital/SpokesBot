'use client'

import { AlertTriangle, CheckCircle, Lightbulb, TrendingUp, Zap } from 'lucide-react'
import type { AIInsight } from '@/types'

interface OverallInsightsProps {
  insights: AIInsight[]
  loading?: boolean
  error?: string | null
  title?: string
  subtitle?: string | null
}

const insightConfig: Record<AIInsight['type'], { icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { icon: CheckCircle,   color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  trend:   { icon: TrendingUp,    color: 'text-blue-500',    bg: 'bg-blue-500/10'    },
  warning: { icon: Zap,           color: 'text-amber-500',   bg: 'bg-amber-500/10'   },
  alert:   { icon: AlertTriangle, color: 'text-orange-500',  bg: 'bg-orange-500/10'  },
}

export function OverallInsights({
  insights,
  loading = false,
  error = null,
  title = 'AI Insights',
  subtitle,
}: OverallInsightsProps) {
  return (
    <div className="bg-gradient-to-br from-card to-muted/30 rounded-xl p-5 card-shadow border border-border">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-5">
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

      {/* Insight items */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer-warm h-14 rounded-lg" />
          ))
        ) : error ? (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        ) : insights.length > 0 ? (
          insights.map((insight, i) => {
            const { icon: Icon, color, bg } = insightConfig[insight.type]
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
            Insights will appear once the active dataset is ready for AI analysis.
          </div>
        )}
      </div>
    </div>
  )
}
