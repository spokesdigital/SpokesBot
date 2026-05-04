'use client'

/**
 * Shared dashboard-to-PDF export utility.
 *
 * Uses html2canvas for rasterization and jsPDF for document generation.
 * Modules are dynamic-imported to keep the main bundle lean.
 */

export async function exportDashboardToPDF(
  elementId: string,
  fileName: string,
  reportTitle?: string
): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const element = document.getElementById(elementId)
  if (!element) throw new Error(`Element #${elementId} not found`)

  const hiddenEls: HTMLElement[] = []
  document.body.classList.add('pdf-export-mode')

  try {
    element.querySelectorAll<HTMLElement>('[data-pdf-hide]').forEach((el) => {
      hiddenEls.push(el)
      el.style.visibility = 'hidden'
    })

    const canvas = await html2canvas(element, {
      scale: 2, // 2× for crisp text / Retina
      useCORS: true,
      logging: false,
      backgroundColor: '#fcfaf7',
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
        { align: 'center' }
      )
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9_\- ]/g, '_')
    const dateStr = new Date().toISOString().slice(0, 10)
    pdf.save(`${safeFileName}-${dateStr}.pdf`)
  } finally {
    document.body.classList.remove('pdf-export-mode')
    hiddenEls.forEach((el) => {
      el.style.visibility = ''
    })
  }
}
