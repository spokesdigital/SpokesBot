'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

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
    const hiddenEls: HTMLElement[] = []

    try {
      // Dynamic imports — avoids SSR issues and keeps the main bundle small
      const [html2canvasModule, jspdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const html2canvas = html2canvasModule.default
      const { jsPDF } = jspdfModule

      const element = document.getElementById(contentId)
      if (!element) {
        console.error(`[ExportButton] Element #${contentId} not found.`)
        return
      }

      // Temporarily hide any elements that shouldn't appear in the PDF
      element.querySelectorAll<HTMLElement>('[data-pdf-hide]').forEach((el) => {
        hiddenEls.push(el)
        el.style.visibility = 'hidden'
      })

      const canvas = await html2canvas(element, {
        scale: 2,           // 2× for crisp text / Retina
        useCORS: true,
        logging: false,
        backgroundColor: '#fcfaf7',
        // html2canvas scrolls the page to the element — this avoids scroll-offset artifacts
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      })

      const imgWidth = canvas.width
      const imgHeight = canvas.height

      // A4 page in mm
      const pageWidth = 210
      const pageHeight = 297
      const margin = 10

      const usableWidth = pageWidth - margin * 2
      const pxPerMm = imgWidth / usableWidth
      const contentHeightMm = imgHeight / pxPerMm

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const totalPages = Math.ceil(contentHeightMm / (pageHeight - margin * 2))

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage()

        const srcY = page * (pageHeight - margin * 2) * pxPerMm
        const srcH = Math.min((pageHeight - margin * 2) * pxPerMm, imgHeight - srcY)

        // Create a slice canvas for this page
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = imgWidth
        sliceCanvas.height = srcH
        const ctx = sliceCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH)

        const sliceData = sliceCanvas.toDataURL('image/png')
        const sliceHeightMm = srcH / pxPerMm

        pdf.addImage(sliceData, 'PNG', margin, margin, usableWidth, sliceHeightMm, undefined, 'FAST')

        // Footer: page number + optional report title
        pdf.setFontSize(8)
        pdf.setTextColor(160, 166, 180)
        const footerY = pageHeight - 4
        pdf.text(
          `Page ${page + 1} of ${totalPages}${reportTitle ? ` · ${reportTitle}` : ''}`,
          pageWidth / 2,
          footerY,
          { align: 'center' },
        )
      }

      const safeFileName = fileName.replace(/[^a-zA-Z0-9_\- ]/g, '_')
      const dateStr = new Date().toISOString().slice(0, 10)
      pdf.save(`${safeFileName}-${dateStr}.pdf`)
    } catch (err) {
      console.error('[ExportButton] PDF export failed:', err)
    } finally {
      hiddenEls.forEach((el) => { el.style.visibility = '' })
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
