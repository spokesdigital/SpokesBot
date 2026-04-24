export async function exportDashboardToPDF(elementId: string, filename: string): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const element = document.getElementById(elementId)
  if (!element) throw new Error(`Element #${elementId} not found`)

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#fcfaf7',
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' })

  const pdfW = pdf.internal.pageSize.getWidth()
  const pdfH = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height)
  const imgW = canvas.width * ratio
  const imgH = canvas.height * ratio
  const x = (pdfW - imgW) / 2
  const y = (pdfH - imgH) / 2

  if (imgH <= pdfH) {
    pdf.addImage(imgData, 'PNG', x, y, imgW, imgH)
  } else {
    // Multi-page: slice canvas into page-height segments
    const pageHeightPx = Math.floor(pdfH / ratio)
    let offsetY = 0
    let first = true
    while (offsetY < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - offsetY)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceH
      const ctx = pageCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      const sliceData = pageCanvas.toDataURL('image/png')
      const sliceImgH = sliceH * ratio
      if (!first) pdf.addPage()
      pdf.addImage(sliceData, 'PNG', x, 0, imgW, sliceImgH)
      offsetY += sliceH
      first = false
    }
  }

  pdf.save(filename)
}
