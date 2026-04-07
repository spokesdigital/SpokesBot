'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface ChartDataPoint {
  name: string
  value: number
}

interface AutoChartProps {
  type: 'bar' | 'line'
  title: string
  data: ChartDataPoint[]
}

const COLORS = {
  bar: '#14b8a6',
  line: '#0ea5e9',
}

export function AutoChart({ type, title, data }: AutoChartProps) {
  if (data.length === 0) return null

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="mb-4 text-sm font-medium capitalize text-slate-600">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.65} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.88)',
                border: '1px solid rgba(255, 255, 255, 0.7)',
                borderRadius: '16px',
                color: '#334155',
                fontSize: '12px',
                boxShadow: '0 16px 38px rgba(148, 163, 184, 0.2)',
                backdropFilter: 'blur(18px)',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={COLORS.line}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.65} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.88)',
                border: '1px solid rgba(255, 255, 255, 0.7)',
                borderRadius: '16px',
                color: '#334155',
                fontSize: '12px',
                boxShadow: '0 16px 38px rgba(148, 163, 184, 0.2)',
                backdropFilter: 'blur(18px)',
              }}
              cursor={{ fill: 'rgba(186, 230, 253, 0.45)' }}
            />
            <Bar dataKey="value" fill={COLORS.bar} radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
