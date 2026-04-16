'use client'

import { useState } from 'react'
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

// ─── Zoom hook ────────────────────────────────────────────────────────────────

function useZoom(dataLength: number) {
  const [zoomState, setZoomState] = useState<{ dataLength: number; range: [number, number] | null }>({
    dataLength,
    range: null,
  })
  const fullRange: [number, number] = [0, Math.max(0, dataLength - 1)]
  const range = zoomState.dataLength === dataLength && zoomState.range ? zoomState.range : fullRange

  const visible = range[1] - range[0] + 1

  const zoomIn = () => {
    if (visible <= 4) return
    const step = Math.max(1, Math.floor(visible * 0.25))
    setZoomState({
      dataLength,
      range: [Math.min(range[0] + step, range[1] - 3), Math.max(range[1] - step, range[0] + 3)],
    })
  }

  const zoomOut = () => {
    const step = Math.max(1, Math.floor(visible * 0.25))
    const nextRange: [number, number] = [Math.max(0, range[0] - step), Math.min(dataLength - 1, range[1] + step)]
    const isFullRange = nextRange[0] === fullRange[0] && nextRange[1] === fullRange[1]
    setZoomState({
      dataLength,
      range: isFullRange ? null : nextRange,
    })
  }

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

function ZoomButtons({ onZoomIn, onZoomOut, canZoomIn, canZoomOut }: ZoomButtonsProps) {
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
}

// ─── Shared style ──────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e8e1d7',
  borderRadius: '18px',
  boxShadow: '0 18px 44px rgba(15, 23, 42, 0.12)',
  fontSize: '13px',
}

function formatXLabel(value: string) {
  try {
    return format(parseISO(value), 'MMM d')
  } catch {
    return value
  }
}

// ─── Shared chart card shell ───────────────────────────────────────────────────

interface ChartCardProps {
  title: string
  height?: number
  empty?: boolean
  emptyMsg?: string
  children: React.ReactNode
}

export function ChartCard({ title, height = 280, empty, emptyMsg, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 card-shadow">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">{title}</h3>
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
}

export function DualAxisComboChart({
  data,
  series,
  leftTickFormatter,
  rightTickFormatter,
  tooltipFormatter,
  connectNulls = false,
  height = 280,
}: DualAxisComboChartProps) {
  const { range, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom(data.length)
  const visibleData = data.slice(range[0], range[1] + 1)
  const hasRight = series.some((s) => s.axis === 'r')

  return (
    <div className="relative flex flex-col h-full">
      <ResponsiveContainer width="100%" height={height - 32}>
        <ComposedChart data={visibleData} margin={{ top: 8, right: hasRight ? 8 : 4, left: -20, bottom: 4 }}>
          <CartesianGrid stroke="#d9dee7" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="date"
            interval={0}
            tickFormatter={formatXLabel}
            tick={{ fill: '#7a8292', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            angle={-45}
            textAnchor="end"
            tickMargin={10}
            height={60}
            padding={{ left: 12, right: 12 }}
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
            labelFormatter={(l) => formatXLabel(String(l))}
            formatter={
              tooltipFormatter
                ? (value: number | string, name: string) => tooltipFormatter(Number(value), name)
                : undefined
            }
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: '20px' }} />
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
                  barSize={20}
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
      {data.length > 4 && (
        <div className="flex justify-center mt-auto pb-1 z-20">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 shadow-sm">
            <ZoomButtons onZoomIn={zoomIn} onZoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
          </div>
        </div>
      )}
    </div>
  )
}

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
  tooltipFormatter?: (value: number) => string
  connectNulls?: boolean
  curveType?: 'basis' | 'basisClosed' | 'basisOpen' | 'bumpX' | 'bumpY' | 'bump' | 'linear' | 'linearClosed' | 'natural' | 'monotoneX' | 'monotoneY' | 'monotone' | 'step' | 'stepBefore' | 'stepAfter'
  height?: number
}

export function AreaTrendChart({
  data,
  series,
  tickFormatter,
  tooltipFormatter,
  connectNulls = false,
  curveType = 'linear',
  height = 280,
}: AreaTrendChartProps) {
  const { range, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom(data.length)
  const visibleData = data.slice(range[0], range[1] + 1)

  return (
    <div className="relative flex flex-col h-full">
      <ResponsiveContainer width="100%" height={height - 32}>
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
            dataKey="date"
            tickFormatter={formatXLabel}
            tick={{ fill: '#7a8292', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            angle={-45}
            textAnchor="end"
            height={50}
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
            labelFormatter={(l) => formatXLabel(String(l))}
            formatter={
              tooltipFormatter
                ? (v: number | string) => [tooltipFormatter(Number(v))]
                : undefined
            }
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: '20px' }} />
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
      {data.length > 4 && (
        <div className="flex justify-center mt-auto pb-1 z-20">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 shadow-sm">
            <ZoomButtons onZoomIn={zoomIn} onZoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
          </div>
        </div>
      )}
    </div>
  )
}

interface DistributionChartProps {
  data: DistributionDatum[]
  height?: number
}

export function DistributionChart({ data, height = 260 }: DistributionChartProps) {
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
}
