'use client'

import { format, parseISO } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type TrendPoint = {
  date: string
  total_revenue?: number | null
  total_cost?: number | null
}

function fmtDateShort(v: string, granularity?: 'daily' | 'monthly') {
  try {
    if (granularity === 'monthly') return format(parseISO(v), 'MMM yyyy')
    return format(parseISO(v), 'MMM d')
  } catch {
    return v
  }
}

function fmtDateLong(v: string, granularity?: 'daily' | 'monthly') {
  try {
    if (granularity === 'monthly') return format(parseISO(v), 'MMM yyyy')
    return format(parseISO(v), 'MMM d, yyyy')
  } catch {
    return String(v)
  }
}

export function OverviewAreaChart({
  data,
  granularity,
}: {
  data: TrendPoint[]
  granularity: 'daily' | 'monthly'
}) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="ov_rev" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f0a500" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f0a500" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ov_cost" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => fmtDateShort(v, granularity)}
            interval={Math.max(0, Math.ceil(data.length / 7) - 1)}
            minTickGap={35}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => `${Math.round(v).toLocaleString('en-US')}`}
          />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
            }}
            formatter={(v: unknown) => {
              const value = typeof v === 'number' ? v : Number(v)
              return Number.isFinite(value)
                ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                : '—'
            }}
            labelFormatter={(v) => fmtDateLong(String(v), granularity)}
          />
          <Area
            type="monotone"
            connectNulls
            dataKey="total_revenue"
            name="Revenue"
            stroke="#f0a500"
            fill="url(#ov_rev)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            connectNulls
            dataKey="total_cost"
            name="Cost"
            stroke="#f97316"
            fill="url(#ov_cost)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function OverviewPieChart({
  data,
  isStatus,
}: {
  data: { name: string; value: number; color: string }[]
  isStatus: boolean
}) {
  const total = data.reduce((s, r) => s + r.value, 0)
  return (
    <div className="flex flex-col items-center justify-center flex-1 -mt-2">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart margin={{ top: 20, right: 20, bottom: 0, left: 20 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={118}
            paddingAngle={data.length > 1 ? 4 : 0}
            dataKey="value"
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) =>
              isStatus
                ? [
                    new Intl.NumberFormat('en-US').format(value) + ' orders',
                    name,
                  ]
                : [
                    new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    }).format(value),
                    name,
                  ]
            }
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 -mt-2 pb-2 ${isStatus ? 'px-2' : ''}`}
      >
        {data.map((entry) => {
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0'
          return (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs font-medium text-slate-600">{entry.name}</span>
              <span className="text-[11px] text-slate-400">({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
