'use client'

import { Info, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

interface KPICardProps {
  title: string
  value: string
  trendValue?: number | null
  trendDirection?: 'positive' | 'negative' | 'neutral'
  tooltip?: string
  loading?: boolean
}

export function KPICard({ title, value, trendValue, trendDirection, tooltip, loading = false }: KPICardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
        <div className="shimmer-warm h-3 w-20 rounded" />
        <div className="shimmer-warm mt-4 h-6 w-24 rounded" />
        <div className="shimmer-warm mt-3 h-3 w-28 rounded" />
      </div>
    )
  }

  const direction: 'positive' | 'negative' | 'neutral' =
    trendDirection ??
    (trendValue == null || Math.abs(trendValue) < 0.05
      ? 'neutral'
      : trendValue > 0
        ? 'positive'
        : 'negative')

  const trendLabel =
    trendValue == null || Math.abs(trendValue) < 0.05
      ? 'No prior comparison'
      : `${Math.abs(trendValue).toFixed(1)}% vs prior`

  const colorClass =
    direction === 'positive'
      ? 'text-emerald-600'
      : direction === 'negative'
        ? 'text-red-500'
        : 'text-muted-foreground'

  const TrendIcon =
    direction === 'positive'
      ? TrendingUp
      : direction === 'negative'
        ? TrendingDown
        : Minus

  return (
    <div className="relative bg-card rounded-xl p-4 sm:p-5 card-shadow border border-border hover:card-shadow-hover transition-shadow duration-200 overflow-visible hover:z-50 focus-within:z-50 has-[[data-state=open]]:z-50">
      {/* Label row */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
          {title}
        </span>
        {tooltip && (
          <TooltipPrimitive.Provider delayDuration={0}>
            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <button
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5 relative z-20"
                  aria-label={tooltip}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipPrimitive.Trigger>
              <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                  side="top"
                  sideOffset={4}
                  className="z-[200] max-w-[200px] rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
                >
                  {tooltip}
                </TooltipPrimitive.Content>
              </TooltipPrimitive.Portal>
            </TooltipPrimitive.Root>
          </TooltipPrimitive.Provider>
        )}
      </div>

      {/* Value */}
      <div className="text-xl sm:text-2xl font-bold tracking-tight mb-2">{value}</div>

      {/* Trend */}
      <div className={`flex items-center gap-1 text-xs font-medium ${colorClass}`}>
        <TrendIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{trendLabel}</span>
      </div>
    </div>
  )
}
