'use client'

/**
 * InlineChart — lazy-loaded chart renderer for AdminChatHistory.
 *
 * This file is intentionally separate so that next/dynamic can code-split
 * the entire recharts bundle (~500 KB) away from the initial admin page load.
 * Recharts is only fetched when a thread containing a <chart> tag is selected.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type ChartSeries = { key: string; label?: string; color?: string }
export type ChartDataPoint = Record<string, string | number | null>

export type ChatChartPayload = {
  type: 'bar' | 'line'
  title?: string
  xKey?: string
  data: ChartDataPoint[]
  series?: ChartSeries[]
}

const DEFAULT_CHART_COLORS = ['#f5b800', '#3b82f6', '#22c55e', '#f97316']

export function InlineChart({ chart }: { chart: ChatChartPayload }) {
  const xKey = chart.xKey ?? 'label'
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#e4ddd2] bg-white/80 px-3 py-3">
      {chart.title && (
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.02em] text-[#57524a]">
          {chart.title}
        </p>
      )}
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'bar' ? (
            <BarChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e8e1d7" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8e1d7', borderRadius: 14 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series?.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={s.color ?? DEFAULT_CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e8e1d7" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#7a7775', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8e1d7', borderRadius: 14 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chart.series?.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? DEFAULT_CHART_COLORS[0]} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
