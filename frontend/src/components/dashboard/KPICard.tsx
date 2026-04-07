import type { ReactNode } from 'react'

type Color = 'blue' | 'emerald' | 'violet' | 'amber'

const colorMap: Record<Color, { bg: string; text: string; border: string }> = {
  blue: {
    bg: 'bg-sky-100/70',
    text: 'text-sky-600',
    border: 'border-sky-200/80',
  },
  emerald: {
    bg: 'bg-emerald-100/70',
    text: 'text-emerald-600',
    border: 'border-emerald-200/80',
  },
  violet: {
    bg: 'bg-violet-100/70',
    text: 'text-violet-600',
    border: 'border-violet-200/80',
  },
  amber: {
    bg: 'bg-amber-100/75',
    text: 'text-amber-600',
    border: 'border-amber-200/80',
  },
}

interface KPICardProps {
  label: string
  value: string | number
  icon: ReactNode
  color?: Color
  subtitle?: string
}

export function KPICard({ label, value, icon, color = 'emerald', subtitle }: KPICardProps) {
  const { bg, text, border } = colorMap[color]

  return (
    <div className={`glass-panel rounded-[1.5rem] p-5 ${bg} ${border}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={text}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${text} truncate`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  )
}
