import puppeteer from 'puppeteer'

let browserPromise = null

function getBrowser() {
  if (!browserPromise) browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  return browserPromise
}

export async function renderPdf(html) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } })
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
