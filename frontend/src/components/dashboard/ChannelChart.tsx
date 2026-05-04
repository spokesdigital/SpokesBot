'use client'

import React, { useCallback, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ZoomIn, ZoomOut } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
// Legend is still used by DistributionChart (PieChart) below

// Minimum pixels per data point. We set this to 0 so the chart naturally fits
// 100% of the container width. The user can use the zoom buttons if the data is too dense.
const MIN_PX_PER_POINT = 0

// ─── Zoom hook ────────────────────────────────────────────────────────────────

function useZoom(dataLength: number) {
  const [zoomState, setZoomState] = useState<{ dataLength: number; range: [number, number] | null }>({
    dataLength,
    range: null,
  })
  const fullRange: [number, number] = [0, Math.max(0, dataLength - 1)]
  const range = zoomState.dataLength === dataLength && zoomState.range ? zoomState.range : fullRange

  const visible = range[1] - range[0] + 1

  const zoomIn = useCallback(() => {
    if (visible <= 4) return
    const step = Math.max(1, Math.floor(visible * 0.25))
    setZoomState({
      dataLength,
      range: [Math.min(range[0] + step, range[1] - 3), Math.max(range[1] - step, range[0] + 3)],
    })
  }, [visible, range, dataLength])

  const zoomOut = useCallback(() => {
    const step = Math.max(1, Math.floor(visible * 0.25))
    const nextRange: [number, number] = [Math.max(0, range[0] - step), Math.min(dataLength - 1, range[1] + step)]
    const isFullRange = nextRange[0] === fullRange[0] && nextRange[1] === fullRange[1]
    setZoomState({
      dataLength,
      range: isFullRange ? null : nextRange,
    })
  }, [visible, range, dataLength, fullRange])

  return {
    range,
    zoomIn,
    zoomOut,
    canZoomIn: visible > 4,
    canZoomOut: range[0] > 0 || range[1] < dataLength - 1,
  }
}

interface ZoomButtonsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}

const ZoomButtons = React.memo(function ZoomButtons({ onZoomIn, onZoomOut, canZoomIn, canZoomOut }: ZoomButtonsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        title="Zoom out"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ZoomOut size={13} />
      </button>
      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        title="Zoom in"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ZoomIn size={13} />
      </button>
    </div>
  )
})

// ─── Shared style ──────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e8e1d7',
  borderRadius: '18px',
  boxShadow: '0 18px 44px rgba(15, 23, 42, 0.12)',
  fontSize: '13px',
}

function formatXLabel(value: string, granularity?: 'daily' | 'monthly') {
  try {
    if (granularity === 'monthly') {
      return format(parseISO(value), "MMM yyyy")
    }
    return format(parseISO(value), 'MMM d')
  } catch {
    return value
  }
}

function getXAxisKey(data: Record<string, unknown>[]) {
  return data.length > 0 && typeof data[0].label === 'string' ? 'label' : 'date'
}

// ─── Shared chart card shell ───────────────────────────────────────────────────

interface ChartCardProps {
  title: string
  height?: number
  empty?: boolean
  emptyMsg?: string
  /** Optional point count badge shown in the top-right corner of the card header. */
  dataCount?: number
  granularity?: 'daily' | 'monthly'
  children: React.ReactNode
}

export function ChartCard({ title, height = 280, empty, emptyMsg, dataCount, granularity, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          {granularity === 'monthly' && !empty && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-200 select-none">
              Monthly
            </span>
          )}
          {dataCount != null && !empty && (
            <span className="text-[11px] tabular-nums text-muted-foreground/60 select-none">
              {dataCount} pts
            </span>
          )}
        </div>
      </div>
      {empty ? (
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-center"
          style={{ height }}
        >
          <p className="max-w-[240px] text-sm leading-6 text-muted-foreground">
            {emptyMsg ?? 'Not enough data yet'}
          </p>
        </div>
      ) : (
        <div style={{ height }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Series descriptors ────────────────────────────────────────────────────────

export interface BarSeries {
  type: 'bar'
  dataKey: string
  name: string
  color: string
  /** 'l' = left axis (default), 'r' = right axis */
  axis?: 'l' | 'r'
}

export interface LineSeries {
  type: 'line'
  dataKey: string
  name: string
  color: string
  axis?: 'l' | 'r'
  dashed?: boolean
}

export interface AreaSeries {
  type: 'area'
  dataKey: string
  name: string
  color: string
  gradientId: string
  gradientOpacity?: number
}

export type ChartSeries = BarSeries | LineSeries | AreaSeries

interface DistributionDatum {
  name: string
  value: number
  color: string
}

// ─── DualAxisComboChart ────────────────────────────────────────────────────────

/**
 * Dual-axis combo chart: left Y-axis for bar series, right Y-axis for line/secondary.
 * Typical use: Bar for Clicks (left), Line for CTR % (right).
 *
 * @example
 * <DualAxisComboChart
 *   data={clicksCtrData}
 *   series={[
 *     { type: 'bar',  dataKey: 'clicks', name: 'Clicks', color: '#4285f4', axis: 'l' },
 *     { type: 'line', dataKey: 'ctr',    name: 'CTR %',  color: '#f5b800', axis: 'r' },
 *   ]}
 *   leftTickFormatter={(v) => String(v)}
 *   rightTickFormatter={(v) => `${v.toFixed(1)}%`}
 *   tooltipFormatter={(v, n) => n.includes('%') ? [`${Number(v).toFixed(2)}%`, n] : [String(v), n]}
 * />
 */
interface DualAxisComboChartProps {
  data: Record<string, unknown>[]
  series: Array<BarSeries | LineSeries>
  leftTickFormatter?: (value: number) => string
  rightTickFormatter?: (value: number) => string
  /** Called with a numeric value (recharts always emits numbers for our data keys). */
  tooltipFormatter?: (value: number, name: string) => [string, string]
  connectNulls?: boolean
  height?: number
  granularity?: 'daily' | 'monthly'
}

export const DualAxisComboChart = React.memo(function DualAxisComboChart({
  data,
  series,
  leftTickFormatter,
  rightTickFormatter,
  tooltipFormatter,
  connectNulls = false,
  height = 280,
  granularity = 'daily',
}: DualAxisComboChartProps) {
  const { range, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom(data.length)
  const visibleData = data.slice(range[0], range[1] + 1)
  const hasRight = series.some((s) => s.axis === 'r')
  const xAxisKey = getXAxisKey(visibleData)

  // With horizontal scrolling each point gets at least MIN_PX_PER_POINT px, so
  // labels are never squished — rotation is not needed.
  const chartMinPx = visibleData.length * MIN_PX_PER_POINT

  const tooltipLabelMap = new Map(
    visibleData.map((row) => [
      String(row[xAxisKey] ?? row.date ?? ''),
      typeof row.tooltipLabel === 'string'
        ? row.tooltipLabel
        : typeof row.label === 'string'
          ? row.label
          : String(row[xAxisKey] ?? row.date ?? ''),
    ]),
  )
  const tickInterval = Math.max(0, Math.ceil(visibleData.length / 6) - 1)
  const barSize = visibleData.length > 60 ? 6 : visibleData.length > 30 ? 10 : visibleData.length > 14 ? 16 : 22

  return (
    <div className="relative flex flex-col h-full">
      {/* Horizontally scrollable chart area — zoom buttons stay outside and fixed */}
      <div
        className="overflow-x-auto overflow-y-hidden chart-scrollbar"
        style={{ height: height - 52 }}
      >
        {/* CSS max() ensures the chart fills the container when data is sparse,
            and expands wider than the container when data is dense → scroll kicks in */}
        <div style={{ width: `max(${chartMinPx}px, 100%)`, height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData} margin={{ top: 8, right: hasRight ? 8 : 4, left: -20, bottom: 4 }}>
              <CartesianGrid stroke="#d9dee7" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey={xAxisKey}
                interval={tickInterval}
                tickFormatter={(value) => xAxisKey === 'label' ? String(value) : formatXLabel(String(value), granularity)}
                tick={{ fill: '#7a8292', fontSize: 12, dx: 0 }}
                tickLine={{ stroke: '#d9dee7', strokeWidth: 1.5 }}
                axisLine={false}
                tickMargin={10}
                height={32}
                padding={{ left: 50, right: 50 }}
              />
              <YAxis
                yAxisId="l"
                tick={{ fill: '#7a8292', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={leftTickFormatter}
                width={52}
              />
              {hasRight && (
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  tick={{ fill: '#7a8292', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={rightTickFormatter}
                  width={52}
                />
              )}
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                labelFormatter={(label) =>
                  tooltipLabelMap.get(String(label))
                  ?? (xAxisKey === 'label' ? String(label) : formatXLabel(String(label), granularity))
                }
                formatter={
                  tooltipFormatter
                    ? (value: number | string, name: string) => tooltipFormatter(Number(value), name)
                    : undefined
                }
              />
              {series.map((s) => {
                const axis = s.axis ?? 'l'
                if (s.type === 'bar') {
                  return (
                    <Bar
                      key={s.dataKey}
                      yAxisId={axis}
                      dataKey={s.dataKey}
                      name={s.name}
                      fill={s.color}
                      radius={[4, 4, 0, 0]}
                      opacity={0.85}
                      barSize={barSize}
                    />
                  )
                }
                return (
                  <Line
                    key={s.dataKey}
                    connectNulls={connectNulls}
                    yAxisId={axis}
                    dataKey={s.dataKey}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={false}
                    strokeDasharray={s.dashed ? '5 3' : undefined}
                  />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Custom centered legend — lives outside the scroll area so it is always
          centred relative to the full card width, not the scrollable chart area */}
      <div className="flex items-center justify-center gap-4 py-1.5">
        {series.map((s) => (
          <span key={s.dataKey} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {s.type === 'bar' ? (
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color, opacity: 0.85 }} />
            ) : (
              <span className="inline-flex items-center gap-0.5">
                <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
              </span>
            )}
            {s.name}
          </span>
        ))}
      </div>
      {data.length > 0 && (
        <div className="absolute right-2 top-2 z-20">
          <div className="bg-card border border-border rounded-full px-2 py-0.5 shadow-sm">
            <ZoomButtons onZoomIn={zoomIn} onZoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
          </div>
        </div>
      )}
    </div>
  )
})

// ─── AreaTrendChart ────────────────────────────────────────────────────────────

/**
 * Single or multi-area trend chart. Typical use: Revenue vs Cost, ROAS trend.
 *
 * @example
 * <AreaTrendChart
 *   data={trendData}
 *   series={[
 *     { type: 'area', dataKey: 'revenue', name: 'Revenue', color: '#f5b800', gradientId: 'rev' },
 *     { type: 'area', dataKey: 'cost',    name: 'Cost',    color: '#f97316', gradientId: 'cost' },
 *   ]}
 *   tickFormatter={(v) => `$${Math.round(v)}`}
 * />
 */
interface AreaTrendChartProps {
  data: Record<string, unknown>[]
  series: AreaSeries[]
  tickFormatter?: (value: number) => string
  tooltipFormatter?: (value: number, name: string) => [string, string]
  connectNulls?: boolean
  curveType?: 'basis' | 'basisClosed' | 'basisOpen' | 'bumpX' | 'bumpY' | 'bump' | 'linear' | 'linearClosed' | 'natural' | 'monotoneX' | 'monotoneY' | 'monotone' | 'step' | 'stepBefore' | 'stepAfter'
  height?: number
  granularity?: 'daily' | 'monthly'
}

export const AreaTrendChart = React.memo(function AreaTrendChart({
  data,
  series,
  tickFormatter,
  tooltipFormatter,
  connectNulls = false,
  curveType = 'linear',
  height = 280,
  granularity = 'daily',
}: AreaTrendChartProps) {
  const { range, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom(data.length)
  const visibleData = data.slice(range[0], range[1] + 1)
  const xAxisKey = getXAxisKey(visibleData)
  const chartMinPx = visibleData.length * MIN_PX_PER_POINT

  const tooltipLabelMap = new Map(
    visibleData.map((row) => [
      String(row[xAxisKey] ?? row.date ?? ''),
      typeof row.tooltipLabel === 'string'
        ? row.tooltipLabel
        : typeof row.label === 'string'
          ? row.label
          : String(row[xAxisKey] ?? row.date ?? ''),
    ]),
  )

  const tickInterval = Math.max(0, Math.ceil(visibleData.length / 6) - 1)

  return (
    <div className="relative flex flex-col h-full">
      {/* Horizontally scrollable chart area — zoom buttons stay outside and fixed */}
      <div
        className="overflow-x-auto overflow-y-hidden chart-scrollbar"
        style={{ height: height - 52 }}
      >
        <div style={{ width: `max(${chartMinPx}px, 100%)`, height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visibleData} margin={{ top: 8, right: 4, left: -20, bottom: 4 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.gradientId} id={s.gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={s.gradientOpacity ?? 0.24} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#d9dee7" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey={xAxisKey}
                interval={tickInterval}
                tickFormatter={(value) => xAxisKey === 'label' ? String(value) : formatXLabel(String(value), granularity)}
                tick={{ fill: '#7a8292', fontSize: 12, dx: 0 }}
                tickLine={{ stroke: '#d9dee7', strokeWidth: 1.5 }}
                axisLine={false}
                tickMargin={10}
                height={32}
                padding={{ left: 50, right: 50 }}
              />
              <YAxis
                tick={{ fill: '#7a8292', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickFormatter}
                width={60}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: '#d9dee7', strokeWidth: 1 }}
                labelFormatter={(label) =>
                  tooltipLabelMap.get(String(label))
                  ?? (xAxisKey === 'label' ? String(label) : formatXLabel(String(label), granularity))
                }
                formatter={
                  tooltipFormatter
                    ? (v: number | string, n: string) => tooltipFormatter(Number(v), n)
                    : undefined
                }
              />
              {series.map((s) => (
                <Area
                  key={s.dataKey}
                  connectNulls={connectNulls}
                  type={curveType}
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  fill={`url(#${s.gradientId})`}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Custom centered legend — lives outside the scroll area so it is always
          centred relative to the full card width, not the scrollable chart area */}
      <div className="flex items-center justify-center gap-4 py-1.5">
        {series.map((s) => (
          <span key={s.dataKey} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
            </span>
            {s.name}
          </span>
        ))}
      </div>
      {data.length > 0 && (
        <div className="absolute right-2 top-2 z-20">
          <div className="bg-card border border-border rounded-full px-2 py-0.5 shadow-sm">
            <ZoomButtons onZoomIn={zoomIn} onZoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
          </div>
        </div>
      )}
    </div>
  )
})

interface DistributionChartProps {
  data: DistributionDatum[]
  height?: number
}

export const DistributionChart = React.memo(function DistributionChart({ data, height = 260 }: DistributionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={4}
          stroke="#ffffff"
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number | string) => [
            new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 2,
            }).format(Number(value)),
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
})
