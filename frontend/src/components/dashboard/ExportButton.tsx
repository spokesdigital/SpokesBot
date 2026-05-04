'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { exportDashboardToPDF } from '@/lib/export'

interface ExportButtonProps {
  /** The DOM id of the element to capture. Defaults to "dashboard-pdf-content". */
  contentId?: string
  /** File name (without extension). Defaults to "dashboard-report". */
  fileName?: string
  /** Label shown on the org/page header, embedded in the PDF footer. */
  reportTitle?: string
}

export function ExportButton({
  contentId = 'dashboard-pdf-content',
  fileName = 'dashboard-report',
  reportTitle,
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (exporting) return
    setExporting(true)

    try {
      await exportDashboardToPDF(contentId, fileName, reportTitle)
    } catch (err) {
      console.error('[ExportButton] PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }


  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      data-pdf-hide          // hide the button itself from the PDF capture
      title="Export dashboard as PDF"
      className={`flex items-center gap-2 rounded-xl border border-[#e8e1d7] bg-white px-3.5 py-2.5 text-sm font-medium text-[#5b6475] shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:border-[#d4cdc5] hover:bg-[#fafaf8] hover:text-[#252b36] disabled:cursor-not-allowed disabled:opacity-60 ${exporting ? 'cursor-wait' : ''}`}
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {exporting ? 'Generating…' : 'Export PDF'}
    </button>
  )
}
