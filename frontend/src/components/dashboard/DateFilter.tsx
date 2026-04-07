'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDashboardStore } from '@/store/dashboard'
import { format, subDays, startOfMonth, startOfYear, startOfDay, endOfDay } from 'date-fns'
import { Calendar, ChevronDown } from 'lucide-react'

type Preset = {
  label: string
  key: string
  getValue: () => { start: Date; end: Date }
}

const presets: Preset[] = [
  {
    label: 'Today',
    key: 'today',
    getValue: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  },
  {
    label: 'Yesterday',
    key: 'yesterday',
    getValue: () => ({
      start: startOfDay(subDays(new Date(), 1)),
      end: endOfDay(subDays(new Date(), 1)),
    }),
  },
  {
    label: 'Last 7 Days',
    key: 'last_7_days',
    getValue: () => ({ start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) }),
  },
  {
    label: 'Last 30 Days',
    key: 'last_30_days',
    getValue: () => ({ start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) }),
  },
  {
    label: 'This Month',
    key: 'this_month',
    getValue: () => ({ start: startOfMonth(new Date()), end: endOfDay(new Date()) }),
  },
  {
    label: 'YTD',
    key: 'ytd',
    getValue: () => ({ start: startOfYear(new Date()), end: endOfDay(new Date()) }),
  },
]

export function DateFilter() {
  const { datePreset, dateRange, setDateRange } = useDashboardStore()
  const [open, setOpen] = useState(false)
  
  // Memoize default preset
  const defaultPreset = useMemo(
    () => presets.find((preset) => preset.key === 'last_30_days') ?? presets[3],
    [],
  )

  // Sync with external store on mount/datePreset change
  useEffect(() => {
    if (datePreset) return
    const { start, end } = defaultPreset.getValue()
    setDateRange(start, end, defaultPreset.key)
  }, [datePreset, defaultPreset, setDateRange])

  // Calculate custom field values (derived state)
  const initialCustomStart = datePreset === 'custom' && dateRange.start 
    ? format(dateRange.start, 'yyyy-MM-dd') 
    : ''
  const initialCustomEnd = datePreset === 'custom' && dateRange.end 
    ? format(dateRange.end, 'yyyy-MM-dd') 
    : ''
    
  const [customStart, setCustomStart] = useState(initialCustomStart)
  const [customEnd, setCustomEnd] = useState(initialCustomEnd)


  // Update dateRange when custom fields change
  useEffect(() => {
    if (datePreset !== 'custom') return
    if (!customStart || !customEnd) return
    
    const start = startOfDay(new Date(customStart))
    const end = endOfDay(new Date(customEnd))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return
    
    setDateRange(start, end, 'custom')
  }, [customStart, customEnd, setDateRange, datePreset])

  const activeLabel = datePreset === 'custom'
    ? 'Custom Range'
    : presets.find((preset) => preset.key === datePreset)?.label ?? defaultPreset.label

  function applyPreset(preset: Preset) {
    const { start, end } = preset.getValue()
    setDateRange(start, end, preset.key)
    setOpen(false)
  }

  function applyCustomRange() {
    if (!customStart || !customEnd) return

    const start = startOfDay(new Date(customStart))
    const end = endOfDay(new Date(customEnd))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return

    setDateRange(start, end, 'custom')
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-[1rem] border border-[#e5dfd6] bg-white px-4 py-3 text-[0.98rem] font-medium text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-[#fffdfa]"
      >
        <Calendar className="h-5 w-5 text-[#7c8493]" />
        <span>{activeLabel}</span>
        <ChevronDown className="h-4 w-4 text-[#7c8493]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-[1.2rem] border border-[#e5dfd6] bg-white py-2 shadow-[0_22px_60px_rgba(15,23,42,0.12)]">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#faf6eb] ${
                  activeLabel === preset.label ? 'font-medium text-[#c48d00]' : 'text-[#4b5563]'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <div className="mx-3 my-2 border-t border-[#eee7dd]" />
            <div className="px-4 pb-3 pt-1">
              <p className={`text-sm ${datePreset === 'custom' ? 'font-medium text-[#c48d00]' : 'text-[#4b5563]'}`}>
                Custom Range
              </p>
              <div className="mt-3 grid gap-3">
                <label className="text-xs font-medium text-[#7c8493]">
                  Start date
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#e5dfd6] px-3 py-2 text-sm text-[#374151] outline-none transition focus:border-[#f5b800]"
                  />
                </label>
                <label className="text-xs font-medium text-[#7c8493]">
                  End date
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#e5dfd6] px-3 py-2 text-sm text-[#374151] outline-none transition focus:border-[#f5b800]"
                  />
                </label>
                <button
                  onClick={applyCustomRange}
                  disabled={!customStart || !customEnd}
                  className="rounded-xl bg-[#f5b800] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply Custom
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}