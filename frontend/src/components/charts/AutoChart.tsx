'use client'

import { useEffect, useRef, useState } from 'react'
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
import { ZoomIn, ZoomOut } from 'lucide-react'

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

function useZoom(dataLength: number) {
  const [range, setRange] = useState<[number, number]>([0, Math.max(0, dataLength - 1)])
  const prevLen = useRef(dataLength)

  useEffect(() => {
    if (prevLen.current !== dataLength) {
      prevLen.current = dataLength
      setRange([0, Math.max(0, dataLength - 1)])
    }
  }, [dataLength])

  const visible = range[1] - range[0] + 1

  const zoomIn = () => {
    if (visible <= 4) return
    const step = Math.max(1, Math.floor(visible * 0.25))
    setRange([Math.min(range[0] + step, range[1] - 3), Math.max(range[1] - step, range[0] + 3)])
  }

  const zoomOut = () => {
    const step = Math.max(1, Math.floor(visible * 0.25))
    setRange([Math.max(0, range[0] - step), Math.min(dataLength - 1, range[1] + step)])
  }

  return {
    range,
    zoomIn,
    zoomOut,
    canZoomIn: visible > 4,
    canZoomOut: range[0] > 0 || range[1] < dataLength - 1,
  }
}

export function AutoChart({ type, title, data }: AutoChartProps) {
  const { range, zoomIn, zoomOut, canZoomIn, canZoomOut } = useZoom(data.length)
  const visibleData = data.slice(range[0], range[1] + 1)

  if (data.length === 0) return null

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium capitalize text-slate-600">{title}</h3>
        {data.length > 4 && (
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={!canZoomOut}
              title="Zoom out"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ZoomOut size={13} />
            </button>
            <button
              onClick={zoomIn}
              disabled={!canZoomIn}
              title="Zoom in"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ZoomIn size={13} />
            </button>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {type === 'line' ? (
          <LineChart data={visibleData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
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
          <BarChart data={visibleData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
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
