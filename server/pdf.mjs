import puppeteer from 'puppeteer'

let browserPromise = null

function getBrowser() {
  if (!browserPromise) browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  return browserPromise
}

/**
 * @param {string} html
 * @param {{ landscape?: boolean, footerLabel?: string }} [options] Apaisado para los formatos con
 *   muchas columnas de evaluado: en vertical, el texto del criterio se estruja hasta ser ilegible.
 *   footerLabel activa numeracion de pagina "N de M" via el pie propio de Puppeteer — opt-in, para
 *   no cambiar el margen/comportamiento de los informes que ya no la llevan.
 */
export async function renderPdf(html, options = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const hasFooter = Boolean(options.footerLabel)
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      landscape: Boolean(options.landscape),
      margin: { top: '16mm', bottom: hasFooter ? '20mm' : '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: hasFooter,
      headerTemplate: '<span></span>',
      footerTemplate: hasFooter
        ? `<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;font-family:Arial,Helvetica,sans-serif;">${options.footerLabel} — página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`
        : '<span></span>',
    })
  } finally {
    await page.close()
  }
}

export async function closePdfBrowser() {
  if (!browserPromise) return
  const browser = await browserPromise
  await browser.close()
  browserPromise = null
}
