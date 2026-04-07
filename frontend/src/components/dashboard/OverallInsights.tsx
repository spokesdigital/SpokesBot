'use client'

import { CheckCircle2, Lightbulb, TrendingUp, TriangleAlert, Zap } from 'lucide-react'
import type { AIInsight } from '@/types'

interface OverallInsightsProps {
  insights: AIInsight[]
  loading?: boolean
  error?: string | null
}

const insightStyles: Record<AIInsight['type'], { icon: typeof CheckCircle2; iconClassName: string }> = {
  success: {
    icon: CheckCircle2,
    iconClassName: 'text-[#22c55e]',
  },
  trend: {
    icon: TrendingUp,
    iconClassName: 'text-[#3b82f6]',
  },
  warning: {
    icon: Zap,
    iconClassName: 'text-[#eab308]',
  },
  alert: {
    icon: TriangleAlert,
    iconClassName: 'text-[#f97316]',
  },
}

export function OverallInsights({ insights, loading = false, error = null }: OverallInsightsProps) {
  return (
    <section className="rounded-[1.7rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff6d7] text-[#d29b00]">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[1.05rem] font-semibold text-[#252b36]">Overall AI Insights</h3>
            <p className="mt-1 text-sm text-[#7a8292]">Structured highlights generated from the active dataset.</p>
          </div>
        </div>

        <span className="rounded-full bg-[#d7a11e] px-3 py-1 text-[0.68rem] font-semibold tracking-[0.14em] text-[#fff7df]">
          AI-POWERED
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[68px] animate-pulse rounded-[1.1rem] border border-[#ece7de] bg-[#f7f7f4]"
            />
          ))
        ) : error ? (
          <div className="rounded-[1.1rem] border border-[#f4d7d2] bg-[#fff7f5] px-4 py-4 text-sm text-[#c2410c]">
            {error}
          </div>
        ) : insights.length > 0 ? (
          insights.map((insight, index) => {
            const { icon: Icon, iconClassName } = insightStyles[insight.type]

            return (
              <div
                key={`${insight.type}-${index}`}
                className="flex w-full items-center gap-3 rounded-[1.1rem] border border-[#ece7de] bg-[#f7f7f4] px-4 py-4"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white">
                  <Icon className={`h-[18px] w-[18px] ${iconClassName}`} />
                </div>
                <p className="flex-1 text-sm leading-6 text-[#4a5261]">{insight.text}</p>
              </div>
            )
          })
        ) : (
          <div className="rounded-[1.1rem] border border-[#ece7de] bg-[#f7f7f4] px-4 py-4 text-sm text-[#7a8292]">
            Insights will appear once the active dataset is ready for AI analysis.
          </div>
        )}
      </div>
    </section>
  )
}
