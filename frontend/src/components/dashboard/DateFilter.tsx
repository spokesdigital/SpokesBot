'use client'

import { useEffect, useRef, useState } from 'react'
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

const DEFAULT_PRESET_KEY = 'last_30_days'

export function DateFilter() {
  const { datePreset, dateRange, setDateRange } = useDashboardStore()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Seed store with default preset on first mount
  useEffect(() => {
    if (datePreset) return
    const preset = presets.find((p) => p.key === DEFAULT_PRESET_KEY)!
    const { start, end } = preset.getValue()
    setDateRange(start, end, preset.key)
  }, [datePreset, setDateRange])

  // Controlled values for the two date inputs
  const [customStart, setCustomStart] = useState(
    datePreset === 'custom' && dateRange.start ? format(dateRange.start, 'yyyy-MM-dd') : '',
  )
  const [customEnd, setCustomEnd] = useState(
    datePreset === 'custom' && dateRange.end ? format(dateRange.end, 'yyyy-MM-dd') : '',
  )

  // Close panel when user clicks outside the container
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const activeLabel =
    datePreset === 'custom'
      ? customStart && customEnd
        ? `${customStart} → ${customEnd}`
        : 'Custom Range'
      : presets.find((p) => p.key === datePreset)?.label ??
        presets.find((p) => p.key === DEFAULT_PRESET_KEY)!.label

  function applyPreset(preset: Preset) {
    const { start, end } = preset.getValue()
    setDateRange(start, end, preset.key)
    // Reset custom inputs so they don't linger when user switches back
    setCustomStart('')
    setCustomEnd('')
    setOpen(false)
  }

  function handleStartChange(value: string) {
    setCustomStart(value)
    // If end is already set, try to apply immediately
    if (value && customEnd) {
      tryApplyCustom(value, customEnd)
    }
  }

  function handleEndChange(value: string) {
    setCustomEnd(value)
    // Both dates now filled — apply and close automatically
    if (customStart && value) {
      tryApplyCustom(customStart, value)
    }
  }

  function tryApplyCustom(startStr: string, endStr: string) {
    const start = startOfDay(new Date(startStr))
    const end = endOfDay(new Date(endStr))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return
    setDateRange(start, end, 'custom')
    setOpen(false) // ← auto-close as soon as both dates are valid
  }

  return (
    // Use a ref instead of a fixed overlay for outside-click detection —
    // this keeps the full button area fully interactive at all times.
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-2.5 rounded-[1rem] border border-[#e5dfd6] bg-white px-4 py-2.5 text-[0.95rem] font-medium text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-[#fffdfa] hover:border-[#f0a500]/40"
      >
        <Calendar className="h-4 w-4 flex-shrink-0 text-[#7c8493]" />
        <span className="whitespace-nowrap">{activeLabel}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-[#7c8493] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-[1.2rem] border border-[#e5dfd6] bg-white py-2 shadow-[0_22px_60px_rgba(15,23,42,0.12)]">

          {/* Preset options */}
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#faf6eb] ${
                datePreset === preset.key ? 'font-semibold text-[#c48d00]' : 'text-[#4b5563]'
              }`}
            >
              {preset.label}
            </button>
          ))}

          {/* Custom range section */}
          <div className="mx-3 my-2 border-t border-[#eee7dd]" />
          <div className="px-4 pb-3.5 pt-1">
            <p className={`mb-3 text-sm font-medium ${datePreset === 'custom' ? 'text-[#c48d00]' : 'text-[#4b5563]'}`}>
              Custom Range
            </p>
            <div className="space-y-2.5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c8493]">Start date</span>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className="w-full rounded-xl border border-[#e5dfd6] px-3 py-2 text-sm text-[#374151] outline-none transition focus:border-[#f5b800] focus:ring-2 focus:ring-[#f9c51b]/25"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c8493]">
                  End date
                  {customStart && !customEnd && (
                    <span className="ml-1.5 text-[#f0a500]">← pick to apply</span>
                  )}
                </span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => handleEndChange(e.target.value)}
                  className="w-full rounded-xl border border-[#e5dfd6] px-3 py-2 text-sm text-[#374151] outline-none transition focus:border-[#f5b800] focus:ring-2 focus:ring-[#f9c51b]/25"
                />
              </label>

              {/* Only show manual apply if dates are set but not yet applied
                  (edge case: user manually clears end date after auto-apply) */}
              {customStart && customEnd && datePreset !== 'custom' && (
                <button
                  type="button"
                  onClick={() => tryApplyCustom(customStart, customEnd)}
                  className="w-full rounded-xl bg-[#f5b800] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
