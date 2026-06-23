import { ipcMain, app, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { getDb } from '../../db/database'
import { join } from 'path'

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function registerInformesHandlers() {
  const db = getDb()

  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('informes:generarPDF', async (_, periodo_id: number) => {
    try {
      // Import order matters: jsPDF first, then autoTable patches its prototype
      const jsPDFModule = await import('jspdf')
      const jsPDF = (jsPDFModule as any).jsPDF ?? (jsPDFModule as any).default
      await import('jspdf-autotable')   // <-- patches jsPDF.prototype.autoTable

      // ── Data ─────────────────────────────────────────────────────────────
      const periodo        = db.prepare('SELECT * FROM periodos WHERE id = ?').get(periodo_id) as any
      const asistencias    = db.prepare('SELECT * FROM asistencias    WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id) as any[]
      const capacitaciones = db.prepare('SELECT * FROM capacitaciones WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id) as any[]
      const tareas         = db.prepare('SELECT * FROM tareas         WHERE periodo_id = ? ORDER BY fecha_limite ASC').all(periodo_id) as any[]

      // ── Document ─────────────────────────────────────────────────────────
      const doc: any = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pW  = doc.internal.pageSize.getWidth()
      const pH  = doc.internal.pageSize.getHeight()
      const mg  = 14
      const HDR_Y  = 8
      const HDR_H  = 22
      const HDR_BOT = HDR_Y + HDR_H
      const BODY_Y  = HDR_BOT + 7   // ~37
      const C1X = mg + 52
      const C2X = pW - mg - 50

      // ── Draw header on current page ───────────────────────────────────────
      function drawHeader() {
        doc.setDrawColor(120, 120, 120)
        doc.setLineWidth(0.4)
        doc.rect(mg, HDR_Y, pW - mg * 2, HDR_H)
        doc.line(C1X, HDR_Y, C1X, HDR_BOT)
        doc.line(C2X, HDR_Y, C2X, HDR_BOT)

        // Logo circle
        const cx = mg + 11, cy = HDR_Y + 11
        doc.setFillColor(0, 120, 192); doc.circle(cx, cy, 9, 'F')
        doc.setFillColor(180, 220, 255); doc.circle(cx, cy, 7, 'F')
        doc.setFillColor(0, 120, 192); doc.circle(cx, cy, 5.5, 'F')
        doc.setFillColor(255, 255, 255); doc.circle(cx, cy - 3, 1.7, 'F')
        doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.2)
        doc.line(cx, cy - 1.3, cx, cy + 2.5)
        doc.line(cx - 2.3, cy + 0.3, cx + 2.3, cy + 0.3)
        doc.line(cx - 0.4, cy + 2.5, cx - 2, cy + 5)
        doc.line(cx + 0.4, cy + 2.5, cx + 2, cy + 5)
        doc.setLineWidth(0.4)

        // Institution name
        doc.setTextColor(30, 60, 110)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
        doc.text('Empresa Social del Estado', mg + 23, HDR_Y + 8)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
        doc.setTextColor(0, 100, 175)
        doc.text('Salud Yopal', mg + 23, HDR_Y + 17)

        // Center title
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
        doc.setTextColor(20, 20, 20)
        doc.text('INFORME', (C1X + C2X) / 2, HDR_Y + 13.5, { align: 'center' })

        // Right: codes (page number is a placeholder, fixed at end)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
        doc.setTextColor(20, 20, 20)
        const rx = C2X + 3
        doc.text('Código : GIN-GDO-FO-17',             rx, HDR_Y + 5)
        doc.text('Versión: 02',                          rx, HDR_Y + 10)
        doc.text('Fecha de Actualización : 09/05/2025', rx, HDR_Y + 15)
        doc.text('Página -- de --',                      rx, HDR_Y + 21)
      }

      function addPage() { doc.addPage(); drawHeader() }

      // Y-cursor helpers
      let y = BODY_Y

      function ensureSpace(needed: number) {
        if (y + needed > pH - 15) { addPage(); y = BODY_Y }
      }

      function sectionBar(num: string, title: string, r: number, g: number, b: number) {
        ensureSpace(14)
        doc.setFillColor(r, g, b); doc.rect(mg, y, pW - mg * 2, 8, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255)
        doc.text(`${num}. ${title}`, mg + 3, y + 5.5)
        y += 11
      }

      function smallText(text: string) {
        ensureSpace(7)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70)
        doc.text(text, mg, y); y += 5
      }

      function hBar(x: number, bY: number, w: number, h: number, pct: number,
                    r: number, g: number, b: number) {
        doc.setFillColor(220, 220, 220); doc.rect(x, bY, w, h, 'F')
        if (pct > 0) {
          doc.setFillColor(r, g, b); doc.rect(x, bY, Math.max(0.5, w * pct / 100), h, 'F')
        }
      }

      // ── Page 1 header ─────────────────────────────────────────────────────
      drawHeader()

      // Period title
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20)
      doc.text(`Informe de Gestión — ${MESES[periodo.mes]} ${periodo.anio}`, mg, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100)
      doc.text(`Generado: ${new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' })}   ·   Estado: ${periodo.estado}`, mg, y); y += 5
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(mg, y, pW - mg, y); y += 7

      // ═══════════════════════════════════════════════════════════════════════
      // 1. ASISTENCIAS TÉCNICAS
      // ═══════════════════════════════════════════════════════════════════════
      sectionBar('1', 'Asistencias Técnicas', 0, 120, 192)

      const asisTotal    = asistencias.length
      const asisCumplidas = asistencias.filter(a => a.cumplido).length
      const asisPct      = asisTotal > 0 ? Math.round((asisCumplidas / asisTotal) * 100) : 0

      smallText(`Total: ${asisTotal}   ·   Cumplidas: ${asisCumplidas}   ·   Pendientes: ${asisTotal - asisCumplidas}`)
      y += 1

      if (asisTotal === 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(160, 160, 160)
        doc.text('No se registraron asistencias técnicas en este período.', mg, y); y += 8
      } else {
        doc.autoTable({
          startY: y,
          margin: { left: mg, right: mg, top: BODY_Y },
          head: [['Fecha', 'Módulo Almera', 'Proceso', 'Persona', 'Qué se hizo', 'Cómo se hizo', 'Estado']],
          body: asistencias.map((a: any) => [
            a.fecha        ?? '—',
            a.gestion      ?? '—',
            a.proceso      ?? '—',
            a.persona      ?? '—',
            a.que_se_hizo  ?? '—',
            a.como_se_hizo ?? '—',
            a.cumplido ? 'Cumplido' : 'Pendiente',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [0, 120, 192], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          alternateRowStyles: { fillColor: [240, 248, 255] },
          columnStyles: {
            0: { cellWidth: 17 }, 1: { cellWidth: 28 }, 2: { cellWidth: 32 },
            3: { cellWidth: 22 }, 4: { cellWidth: 38 }, 5: { cellWidth: 30 },
            6: { cellWidth: 15 },
          },
          willDrawPage: () => drawHeader(),
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 2. TAREAS
      // ═══════════════════════════════════════════════════════════════════════
      ensureSpace(14)
      sectionBar('2', 'Tareas Realizadas', 16, 185, 129)

      const tareasTotal    = tareas.length
      const tareasComp     = tareas.filter(t => t.estado === 'completada').length
      const tareasPct      = tareasTotal > 0 ? Math.round((tareasComp / tareasTotal) * 100) : 0

      smallText(`Total: ${tareasTotal}   ·   Completadas: ${tareasComp}   ·   Pendientes: ${tareasTotal - tareasComp}`)
      y += 1

      if (tareasTotal === 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(160, 160, 160)
        doc.text('No se registraron tareas en este período.', mg, y); y += 8
      } else {
        doc.autoTable({
          startY: y,
          margin: { left: mg, right: mg, top: BODY_Y },
          head: [['Título', 'Descripción', 'Prioridad', 'Fecha límite', 'Completada', 'Notas de cierre', 'Estado']],
          body: tareas.map((t: any) => [
            t.titulo          ?? '—',
            t.descripcion     ?? '—',
            t.prioridad       ?? '—',
            t.fecha_limite    ?? '—',
            t.completada_en   ? t.completada_en.split(' ')[0] : '—',
            t.notas_cierre    ?? '—',
            t.estado === 'completada' ? 'Completada' : 'Pendiente',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          alternateRowStyles: { fillColor: [240, 255, 248] },
          columnStyles: {
            0: { cellWidth: 32 }, 1: { cellWidth: 38 }, 2: { cellWidth: 16 },
            3: { cellWidth: 18 }, 4: { cellWidth: 18 }, 5: { cellWidth: 32 },
            6: { cellWidth: 18 },
          },
          willDrawPage: () => drawHeader(),
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 3. CAPACITACIONES
      // ═══════════════════════════════════════════════════════════════════════
      ensureSpace(14)
      sectionBar('3', 'Capacitaciones', 111, 66, 193)

      const capTotal     = capacitaciones.length
      const capCompletas = capacitaciones.filter((c: any) =>
        c.sesion1 === 'completado' && c.sesion2 === 'completado' && c.sesion3 === 'completado'
      ).length
      const capPct = capTotal > 0 ? Math.round((capCompletas / capTotal) * 100) : 0

      smallText(`Total: ${capTotal}   ·   Completas (3/3 sesiones): ${capCompletas}   ·   En proceso: ${capTotal - capCompletas}`)
      y += 1

      if (capTotal === 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(160, 160, 160)
        doc.text('No se registraron capacitaciones en este período.', mg, y); y += 8
      } else {
        const SES: Record<string,string> = {
          completado: 'Completado', pendiente: 'Pendiente', falta_sesion: 'Falta sesión',
        }
        doc.autoTable({
          startY: y,
          margin: { left: mg, right: mg, top: BODY_Y },
          head: [['Fecha', 'Título', 'Descripción', 'Sesión 1', 'Sesión 2', 'Sesión 3', 'Completa']],
          body: capacitaciones.map((c: any) => [
            c.fecha ?? '—', c.titulo ?? '—', c.descripcion ?? '—',
            SES[c.sesion1] ?? c.sesion1,
            SES[c.sesion2] ?? c.sesion2,
            SES[c.sesion3] ?? c.sesion3,
            (c.sesion1 === 'completado' && c.sesion2 === 'completado' && c.sesion3 === 'completado') ? 'Sí' : 'No',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [111, 66, 193], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          alternateRowStyles: { fillColor: [248, 245, 255] },
          columnStyles: {
            0: { cellWidth: 17 }, 1: { cellWidth: 38 }, 2: { cellWidth: 46 },
            3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 22 },
            6: { cellWidth: 15 },
          },
          willDrawPage: () => drawHeader(),
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 4. CUMPLIMIENTO Y ADHERENCIA
      // ═══════════════════════════════════════════════════════════════════════
      ensureSpace(70)
      sectionBar('4', 'Cumplimiento y Adherencia del Período', 51, 65, 85)

      const BW = 90, BH = 8, LW = 62

      // Bar: Asistencias
      ensureSpace(BH + 8)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0, 90, 150)
      doc.text('Asistencias técnicas cumplidas', mg, y + BH - 1.5)
      hBar(mg + LW, y, BW, BH, asisPct, 0, 120, 192)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20)
      doc.text(`${asisPct}%  (${asisCumplidas}/${asisTotal})`, mg + LW + BW + 4, y + BH - 1)
      y += BH + 6

      // Bar: Tareas
      ensureSpace(BH + 8)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(10, 120, 80)
      doc.text('Tareas completadas', mg, y + BH - 1.5)
      hBar(mg + LW, y, BW, BH, tareasPct, 16, 185, 129)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20)
      doc.text(`${tareasPct}%  (${tareasComp}/${tareasTotal})`, mg + LW + BW + 4, y + BH - 1)
      y += BH + 6

      // Bar: Capacitaciones
      ensureSpace(BH + 8)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(80, 40, 160)
      doc.text('Capacitaciones completadas (3/3 sesiones)', mg, y + BH - 1.5)
      hBar(mg + LW, y, BW, BH, capPct, 111, 66, 193)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20)
      doc.text(`${capPct}%  (${capCompletas}/${capTotal})`, mg + LW + BW + 4, y + BH - 1)
      y += BH + 10

      // Summary table
      const totalReg   = asisTotal + tareasTotal + capTotal
      const totalOk    = asisCumplidas + tareasComp + capCompletas
      const promedio   = totalReg > 0 ? Math.round((totalOk / totalReg) * 100) : 0

      doc.autoTable({
        startY: y,
        margin: { left: mg, right: mg, top: BODY_Y },
        head: [['Indicador', 'Total registrados', 'Cumplidos / Completos', '% Adherencia']],
        body: [
          ['Asistencias técnicas',  `${asisTotal}`,   `${asisCumplidas}`, `${asisPct}%`],
          ['Tareas',                `${tareasTotal}`, `${tareasComp}`,    `${tareasPct}%`],
          ['Capacitaciones',        `${capTotal}`,    `${capCompletas}`,  `${capPct}%`],
          ['PROMEDIO GENERAL',      `${totalReg}`,    `${totalOk}`,       `${promedio}%`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 70 }, 1: { cellWidth: 40 },
          2: { cellWidth: 45 }, 3: { cellWidth: 25 },
        },
        willDrawPage: () => drawHeader(),
      })

      // ── Stamp "Página X de Y" on every page ──────────────────────────────
      const totalPgs = doc.getNumberOfPages()
      for (let pg = 1; pg <= totalPgs; pg++) {
        doc.setPage(pg)
        doc.setFillColor(255, 255, 255)
        doc.rect(C2X + 1, HDR_Y + 17.5, pW - C2X - mg - 1.5, 5, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(20, 20, 20)
        doc.text(`Página ${pg} de ${totalPgs}`, C2X + 3, HDR_Y + 21.5)
      }

      // ── Save via fs (doc.save() doesn't work in Node/Electron main) ──────
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: join(
          app.getPath('documents'),
          `informe-gestion-${MESES[periodo.mes].toLowerCase()}-${periodo.anio}.pdf`
        ),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (!filePath) return { ok: false }

      writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')))
      return { ok: true, ruta: filePath }

    } catch (e: any) {
      console.error('[informes:generarPDF] Error:', e?.message ?? e)
      return { ok: false, error: String(e?.message ?? e) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('informes:generarExcel', async (_, periodo_id: number) => {
    try {
      const XLSX    = await import('xlsx')
      const periodo = db.prepare('SELECT * FROM periodos WHERE id = ?').get(periodo_id) as any

      const asistencias    = db.prepare('SELECT * FROM asistencias    WHERE periodo_id = ?').all(periodo_id)
      const capacitaciones = db.prepare('SELECT * FROM capacitaciones WHERE periodo_id = ?').all(periodo_id)
      const indicadores    = db.prepare('SELECT * FROM indicadores    WHERE periodo_id = ?').all(periodo_id)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(asistencias),    'Asistencias')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capacitaciones), 'Capacitaciones')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(indicadores),    'Indicadores')

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: join(
          app.getPath('documents'),
          `informe-gestion-${MESES[periodo.mes].toLowerCase()}-${periodo.anio}.xlsx`
        ),
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      })
      if (!filePath) return { ok: false }

      XLSX.writeFile(wb, filePath)
      return { ok: true, ruta: filePath }
    } catch (e: any) {
      console.error('[informes:generarExcel] Error:', e?.message ?? e)
      return { ok: false }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('informes:generarWord', async (_, periodo_id: number) => {
    try {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
        convertInchesToTwip,
      } = await import('docx') as any

      const periodo        = db.prepare('SELECT * FROM periodos WHERE id = ?').get(periodo_id) as any
      const asistencias    = db.prepare('SELECT * FROM asistencias    WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id) as any[]
      const capacitaciones = db.prepare('SELECT * FROM capacitaciones WHERE periodo_id = ? ORDER BY fecha DESC').all(periodo_id) as any[]
      const tareas         = db.prepare('SELECT * FROM tareas         WHERE periodo_id = ? ORDER BY fecha_limite ASC').all(periodo_id) as any[]

      const mesLabel = `${MESES[periodo.mes]} ${periodo.anio}`
      const hoy      = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

      // ── Helpers ───────────────────────────────────────────────────────────
      const noBorder = {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      }

      function sectionHeading(num: string, title: string, color = '1E3A5F') {
        return new Paragraph({
          children: [new TextRun({ text: `${num}. ${title}`, bold: true, size: 24, color: 'FFFFFF' })],
          shading: { type: ShadingType.SOLID, color, fill: color },
          spacing: { before: 300, after: 120 },
          indent: { left: 100 },
        })
      }

      function stat(label: string, value: string) {
        return new Paragraph({
          children: [
            new TextRun({ text: label + ': ', bold: true, size: 18, color: '334155' }),
            new TextRun({ text: value, size: 18, color: '475569' }),
          ],
          spacing: { after: 60 },
        })
      }

      function makeHeaderRow(cols: string[], fillColor: string) {
        return new TableRow({
          children: cols.map(c => new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: c, bold: true, color: 'FFFFFF', size: 16 })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { type: ShadingType.SOLID, color: fillColor, fill: fillColor },
            borders: noBorder,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          })),
          tableHeader: true,
        })
      }

      function makeRow(cells: string[], shade = false) {
        return new TableRow({
          children: cells.map(c => new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: c ?? '—', size: 16 })],
            })],
            shading: shade ? { type: ShadingType.SOLID, color: 'F8FAFC', fill: 'F8FAFC' } : undefined,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          })),
        })
      }

      function emptyRows(label = '[Ningún registro en este período]') {
        return [new TableRow({
          children: [new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: label, italics: true, color: '94A3B8', size: 16 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: noBorder,
          })],
        })]
      }

      // ── Stats ─────────────────────────────────────────────────────────────
      const asisCump   = asistencias.filter(a => a.cumplido).length
      const asisPct    = asistencias.length > 0 ? Math.round(asisCump / asistencias.length * 100) : 0
      const tareasComp = tareas.filter(t => t.estado === 'completada').length
      const tareasPct  = tareas.length > 0 ? Math.round(tareasComp / tareas.length * 100) : 0
      const capComp    = capacitaciones.filter(c => c.sesion1 === 'completado' && c.sesion2 === 'completado' && c.sesion3 === 'completado').length
      const capPct     = capacitaciones.length > 0 ? Math.round(capComp / capacitaciones.length * 100) : 0
      const totalReg   = asistencias.length + tareas.length + capacitaciones.length
      const totalOk    = asisCump + tareasComp + capComp
      const promedio   = totalReg > 0 ? Math.round(totalOk / totalReg * 100) : 0

      const SES: Record<string, string> = { completado: 'Completado', pendiente: 'Pendiente', falta_sesion: 'Falta sesión' }

      // ── Document ──────────────────────────────────────────────────────────
      const doc = new Document({
        styles: {
          default: {
            document: { run: { font: 'Calibri', size: 20 } },
          },
        },
        sections: [{
          properties: {
            page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) } },
          },
          children: [
            // ── Portada ──
            new Paragraph({
              children: [new TextRun({ text: 'Empresa Social del Estado  ·  Salud Yopal', size: 18, color: '64748B' })],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: `Informe de Gestión — ${mesLabel}`,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 160 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `Generado: ${hoy}`, size: 18, color: '64748B' }),
                new TextRun({ text: '     ·     ', size: 18, color: 'CBD5E1' }),
                new TextRun({ text: `Estado del período: ${periodo.estado}`, size: 18, color: '64748B' }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new Paragraph({
              children: [new TextRun({ text: '─'.repeat(80), color: 'CBD5E1', size: 16 })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // ── Introducción (placeholder) ──
            new Paragraph({
              children: [new TextRun({ text: 'Introducción', bold: true, size: 22, color: '1E293B' })],
              spacing: { before: 200, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({
                text: '[Escriba aquí la introducción del informe: contexto del período, objetivos generales, alcance de las actividades desarrolladas, etc.]',
                italics: true, color: '94A3B8', size: 18,
              })],
              spacing: { after: 400 },
            }),

            // ═══════════════════════════════
            // 1. ASISTENCIAS TÉCNICAS
            // ═══════════════════════════════
            sectionHeading('1', 'Asistencias Técnicas', '0078C0'),
            stat('Total', String(asistencias.length)),
            stat('Cumplidas', `${asisCump} (${asisPct}%)`),
            stat('Pendientes', String(asistencias.length - asisCump)),
            new Paragraph({ text: '', spacing: { after: 120 } }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: asistencias.length === 0
                ? [makeHeaderRow(['Fecha','Módulo','Proceso','Persona','Qué se hizo','Cómo se hizo','Estado'], '0078C0'), ...emptyRows()]
                : [
                    makeHeaderRow(['Fecha','Módulo','Proceso','Persona','Qué se hizo','Cómo se hizo','Estado'], '0078C0'),
                    ...asistencias.map((a, i) => makeRow([
                      a.fecha ?? '—', a.gestion ?? '—', a.proceso ?? '—', a.persona ?? '—',
                      a.que_se_hizo ?? '—', a.como_se_hizo ?? '—', a.cumplido ? 'Cumplido' : 'Pendiente',
                    ], i % 2 === 1)),
                  ],
            }),

            // ═══════════════════════════════
            // 2. TAREAS
            // ═══════════════════════════════
            new Paragraph({ text: '', spacing: { before: 400 } }),
            sectionHeading('2', 'Tareas Realizadas', '10B981'),
            stat('Total', String(tareas.length)),
            stat('Completadas', `${tareasComp} (${tareasPct}%)`),
            stat('Pendientes', String(tareas.length - tareasComp)),
            new Paragraph({ text: '', spacing: { after: 120 } }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tareas.length === 0
                ? [makeHeaderRow(['Título','Descripción','Prioridad','Fecha límite','Completada','Nota de cierre','Estado'], '10B981'), ...emptyRows()]
                : [
                    makeHeaderRow(['Título','Descripción','Prioridad','Fecha límite','Completada','Nota de cierre','Estado'], '10B981'),
                    ...tareas.map((t, i) => makeRow([
                      t.titulo ?? '—', t.descripcion ?? '—', t.prioridad ?? '—',
                      t.fecha_limite ?? '—', t.completada_en ? t.completada_en.split(' ')[0] : '—',
                      t.notas_cierre ?? '—', t.estado === 'completada' ? 'Completada' : 'Pendiente',
                    ], i % 2 === 1)),
                  ],
            }),

            // ═══════════════════════════════
            // 3. CAPACITACIONES
            // ═══════════════════════════════
            new Paragraph({ text: '', spacing: { before: 400 } }),
            sectionHeading('3', 'Capacitaciones', '6F42C1'),
            stat('Total', String(capacitaciones.length)),
            stat('Completas (3/3 sesiones)', `${capComp} (${capPct}%)`),
            stat('En proceso', String(capacitaciones.length - capComp)),
            new Paragraph({ text: '', spacing: { after: 120 } }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: capacitaciones.length === 0
                ? [makeHeaderRow(['Fecha','Título','Descripción','Sesión 1','Sesión 2','Sesión 3','Completa'], '6F42C1'), ...emptyRows()]
                : [
                    makeHeaderRow(['Fecha','Título','Descripción','Sesión 1','Sesión 2','Sesión 3','Completa'], '6F42C1'),
                    ...capacitaciones.map((c, i) => makeRow([
                      c.fecha ?? '—', c.titulo ?? '—', c.descripcion ?? '—',
                      SES[c.sesion1] ?? c.sesion1, SES[c.sesion2] ?? c.sesion2, SES[c.sesion3] ?? c.sesion3,
                      (c.sesion1 === 'completado' && c.sesion2 === 'completado' && c.sesion3 === 'completado') ? 'Sí' : 'No',
                    ], i % 2 === 1)),
                  ],
            }),

            // ═══════════════════════════════
            // 4. CUMPLIMIENTO
            // ═══════════════════════════════
            new Paragraph({ text: '', spacing: { before: 400 } }),
            sectionHeading('4', 'Cumplimiento y Adherencia del Período', '334155'),
            new Paragraph({ text: '', spacing: { after: 120 } }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                makeHeaderRow(['Indicador','Total registrados','Cumplidos / Completos','% Adherencia'], '334155'),
                makeRow(['Asistencias técnicas', String(asistencias.length), String(asisCump), `${asisPct}%`]),
                makeRow(['Tareas', String(tareas.length), String(tareasComp), `${tareasPct}%`], true),
                makeRow(['Capacitaciones', String(capacitaciones.length), String(capComp), `${capPct}%`]),
                makeRow(['PROMEDIO GENERAL', String(totalReg), String(totalOk), `${promedio}%`], true),
              ],
            }),

            // ── Conclusiones (placeholder) ──
            new Paragraph({ text: '', spacing: { before: 400 } }),
            new Paragraph({
              children: [new TextRun({ text: 'Conclusiones', bold: true, size: 22, color: '1E293B' })],
              spacing: { before: 200, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({
                text: '[Escriba aquí las conclusiones del informe: logros del período, aspectos a mejorar, recomendaciones para el siguiente ciclo, etc.]',
                italics: true, color: '94A3B8', size: 18,
              })],
              spacing: { after: 200 },
            }),
          ],
        }],
      })

      const buffer = await Packer.toBuffer(doc)

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: join(
          app.getPath('documents'),
          `informe-gestion-${MESES[periodo.mes].toLowerCase()}-${periodo.anio}.docx`
        ),
        filters: [{ name: 'Word', extensions: ['docx'] }],
      })
      if (!filePath) return { ok: false }

      writeFileSync(filePath, buffer)
      return { ok: true, ruta: filePath }
    } catch (e: any) {
      console.error('[informes:generarWord] Error:', e?.message ?? e)
      return { ok: false, error: String(e?.message ?? e) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // PDF de consulta filtrada
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('consulta:generarPDF', async (_, payload: {
    periodo:        any
    desde?:         string
    hasta?:         string
    tipos:          string[]
    asistencias:    any[]
    tareas:         any[]
    capacitaciones: any[]
    indicadores:    any[]
  }) => {
    try {
      const jsPDFModule = await import('jspdf')
      const jsPDF = (jsPDFModule as any).jsPDF ?? (jsPDFModule as any).default
      await import('jspdf-autotable')

      const { periodo, desde, hasta, tipos, asistencias, tareas, capacitaciones, indicadores } = payload

      const doc: any = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pW = doc.internal.pageSize.getWidth()
      const pH = doc.internal.pageSize.getHeight()
      const mg = 14
      const HDR_Y  = 8, HDR_H = 22, HDR_BOT = HDR_Y + HDR_H
      const BODY_Y = HDR_BOT + 7
      const C1X = mg + 52, C2X = pW - mg - 50

      function drawHeader() {
        doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.4)
        doc.rect(mg, HDR_Y, pW - mg * 2, HDR_H)
        doc.line(C1X, HDR_Y, C1X, HDR_BOT)
        doc.line(C2X, HDR_Y, C2X, HDR_BOT)
        // Logo
        const cx = mg + 11, cy = HDR_Y + 11
        doc.setFillColor(0,120,192);  doc.circle(cx,cy,9,'F')
        doc.setFillColor(180,220,255);doc.circle(cx,cy,7,'F')
        doc.setFillColor(0,120,192);  doc.circle(cx,cy,5.5,'F')
        doc.setFillColor(255,255,255);doc.circle(cx,cy-3,1.7,'F')
        doc.setDrawColor(255,255,255);doc.setLineWidth(1.2)
        doc.line(cx,cy-1.3,cx,cy+2.5); doc.line(cx-2.3,cy+0.3,cx+2.3,cy+0.3)
        doc.line(cx-0.4,cy+2.5,cx-2,cy+5); doc.line(cx+0.4,cy+2.5,cx+2,cy+5)
        doc.setLineWidth(0.4)
        // Entidad
        doc.setTextColor(30,60,110); doc.setFont('helvetica','normal'); doc.setFontSize(6)
        doc.text('Empresa Social del Estado', mg+23, HDR_Y+8)
        doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,100,175)
        doc.text('Salud Yopal', mg+23, HDR_Y+17)
        // Centro
        doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(20,20,20)
        doc.text('INFORME DE CONSULTA', (C1X+C2X)/2, HDR_Y+13.5, { align:'center' })
        // Derecha
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(20,20,20)
        const rx = C2X + 3
        doc.text('Código : GIN-GDO-FO-17', rx, HDR_Y+5)
        doc.text('Versión: 02',              rx, HDR_Y+10)
        doc.text('Fecha  : 09/05/2025',      rx, HDR_Y+15)
        doc.text('Página -- de --',           rx, HDR_Y+21)
      }

      function addPage() { doc.addPage(); drawHeader() }
      let y = BODY_Y
      function ensureSpace(n: number) { if (y + n > pH - 15) { addPage(); y = BODY_Y } }

      function sectionBar(num: string, title: string, r: number, g: number, b: number) {
        ensureSpace(14)
        doc.setFillColor(r,g,b); doc.rect(mg, y, pW-mg*2, 8, 'F')
        doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255,255,255)
        doc.text(`${num}. ${title}`, mg+3, y+5.5); y += 11
      }

      function smallText(text: string) {
        ensureSpace(7)
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70)
        doc.text(text, mg, y); y += 5
      }

      function hBar(x: number, bY: number, w: number, h: number, pct: number, r: number, g: number, b: number) {
        doc.setFillColor(220,220,220); doc.rect(x,bY,w,h,'F')
        if (pct > 0) { doc.setFillColor(r,g,b); doc.rect(x,bY,Math.max(0.5,w*pct/100),h,'F') }
      }

      // ── Página 1 ──
      drawHeader()
      const periodoLabel = `${MESES[periodo.mes]} ${periodo.anio}`
      const filtroLabel  = [
        desde && `Desde: ${desde}`,
        hasta && `Hasta: ${hasta}`,
        tipos.length < 4 && `Tipos: ${tipos.join(', ')}`,
      ].filter(Boolean).join('   ·   ') || 'Sin filtros adicionales'

      doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(20,20,20)
      doc.text(`Informe de Consulta — ${periodoLabel}`, mg, y); y += 6
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100)
      doc.text(`Generado: ${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}   ·   ${filtroLabel}`, mg, y); y += 5
      doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.line(mg,y,pW-mg,y); y += 7

      let secNum = 1

      // ── 1. ASISTENCIAS ──
      if (tipos.includes('asistencias')) {
        const ok  = asistencias.filter(a => a.cumplido).length
        const pct = asistencias.length > 0 ? Math.round((ok/asistencias.length)*100) : 0
        sectionBar(`${secNum++}`, 'Asistencias Técnicas', 0, 120, 192)
        smallText(`Total: ${asistencias.length}   ·   Cumplidas: ${ok}   ·   Pendientes: ${asistencias.length-ok}   ·   Adherencia: ${pct}%`)
        hBar(mg, y, pW-mg*2, 5, pct, 0,120,192); y += 8
        if (asistencias.length === 0) {
          doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(160,160,160)
          doc.text('Sin asistencias en el rango seleccionado.', mg, y); y += 8
        } else {
          doc.autoTable({
            startY: y, margin:{ left:mg, right:mg, top:BODY_Y },
            head: [['#','Fecha','Módulo','Proceso','Persona','Qué se hizo','Cómo se hizo','Estado']],
            body: asistencias.map((a,i) => [
              i+1, a.fecha??'—', a.gestion??'—', a.proceso??'—', a.persona??'—',
              a.que_se_hizo??'—', a.como_se_hizo??'—', a.cumplido?'Cumplido':'Pendiente',
            ]),
            theme:'striped',
            headStyles:{ fillColor:[0,120,192], textColor:255, fontSize:7, fontStyle:'bold' },
            bodyStyles:{ fontSize:7 },
            alternateRowStyles:{ fillColor:[240,248,255] },
            columnStyles:{ 0:{cellWidth:7}, 1:{cellWidth:16}, 2:{cellWidth:24}, 3:{cellWidth:28}, 4:{cellWidth:20}, 5:{cellWidth:35}, 6:{cellWidth:28}, 7:{cellWidth:14} },
            willDrawPage: ()=>drawHeader(),
          })
          y = doc.lastAutoTable.finalY + 8
        }
      }

      // ── 2. TAREAS ──
      if (tipos.includes('tareas')) {
        const ok  = tareas.filter(t => t.estado === 'completada').length
        const pct = tareas.length > 0 ? Math.round((ok/tareas.length)*100) : 0
        sectionBar(`${secNum++}`, 'Tareas', 16, 185, 129)
        smallText(`Total: ${tareas.length}   ·   Completadas: ${ok}   ·   Pendientes: ${tareas.length-ok}   ·   Cumplimiento: ${pct}%`)
        hBar(mg, y, pW-mg*2, 5, pct, 16,185,129); y += 8
        if (tareas.length === 0) {
          doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(160,160,160)
          doc.text('Sin tareas en el rango seleccionado.', mg, y); y += 8
        } else {
          doc.autoTable({
            startY: y, margin:{ left:mg, right:mg, top:BODY_Y },
            head: [['#','Título','Descripción','Prioridad','Fecha límite','Completada','Nota de cierre','Estado']],
            body: tareas.map((t,i) => [
              i+1, t.titulo??'—', t.descripcion??'—', t.prioridad??'—',
              t.fecha_limite??'—', t.completada_en?t.completada_en.split(' ')[0]:'—',
              t.notas_cierre??'—', t.estado==='completada'?'Completada':'Pendiente',
            ]),
            theme:'striped',
            headStyles:{ fillColor:[16,185,129], textColor:255, fontSize:7, fontStyle:'bold' },
            bodyStyles:{ fontSize:7 },
            alternateRowStyles:{ fillColor:[240,255,248] },
            columnStyles:{ 0:{cellWidth:7}, 1:{cellWidth:30}, 2:{cellWidth:35}, 3:{cellWidth:14}, 4:{cellWidth:18}, 5:{cellWidth:18}, 6:{cellWidth:30}, 7:{cellWidth:16} },
            willDrawPage: ()=>drawHeader(),
          })
          y = doc.lastAutoTable.finalY + 8
        }
      }

      // ── 3. CAPACITACIONES ──
      if (tipos.includes('capacitaciones')) {
        const SL: Record<string,string> = { completado:'Completado', pendiente:'Pendiente', falta_sesion:'Falta sesión' }
        const ok  = capacitaciones.filter(c => c.sesion1==='completado'&&c.sesion2==='completado'&&c.sesion3==='completado').length
        const pct = capacitaciones.length > 0 ? Math.round((ok/capacitaciones.length)*100) : 0
        sectionBar(`${secNum++}`, 'Capacitaciones', 111, 66, 193)
        smallText(`Total: ${capacitaciones.length}   ·   Completas (3/3): ${ok}   ·   En proceso: ${capacitaciones.length-ok}   ·   Adherencia: ${pct}%`)
        hBar(mg, y, pW-mg*2, 5, pct, 111,66,193); y += 8
        if (capacitaciones.length === 0) {
          doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(160,160,160)
          doc.text('Sin capacitaciones en el rango seleccionado.', mg, y); y += 8
        } else {
          doc.autoTable({
            startY: y, margin:{ left:mg, right:mg, top:BODY_Y },
            head: [['#','Fecha','Título','Descripción','S1','S2','S3','Completa']],
            body: capacitaciones.map((c,i) => [
              i+1, c.fecha??'—', c.titulo??'—', c.descripcion??'—',
              SL[c.sesion1]??c.sesion1, SL[c.sesion2]??c.sesion2, SL[c.sesion3]??c.sesion3,
              (c.sesion1==='completado'&&c.sesion2==='completado'&&c.sesion3==='completado')?'Sí':'No',
            ]),
            theme:'striped',
            headStyles:{ fillColor:[111,66,193], textColor:255, fontSize:7, fontStyle:'bold' },
            bodyStyles:{ fontSize:7 },
            alternateRowStyles:{ fillColor:[248,245,255] },
            columnStyles:{ 0:{cellWidth:7}, 1:{cellWidth:16}, 2:{cellWidth:34}, 3:{cellWidth:42}, 4:{cellWidth:18}, 5:{cellWidth:18}, 6:{cellWidth:18}, 7:{cellWidth:12} },
            willDrawPage: ()=>drawHeader(),
          })
          y = doc.lastAutoTable.finalY + 8
        }
      }

      // ── 4. INDICADORES ──
      if (tipos.includes('indicadores')) {
        const ok  = indicadores.filter(i => i.estado === 'al_dia').length
        const pct = indicadores.length > 0 ? Math.round((ok/indicadores.length)*100) : 0
        sectionBar(`${secNum++}`, 'Indicadores', 245, 158, 11)
        smallText(`Total: ${indicadores.length}   ·   Al día: ${ok}   ·   En riesgo/crítico: ${indicadores.length-ok}   ·   Cumplimiento: ${pct}%`)
        hBar(mg, y, pW-mg*2, 5, pct, 245,158,11); y += 8
        if (indicadores.length === 0) {
          doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(160,160,160)
          doc.text('Sin indicadores registrados.', mg, y); y += 8
        } else {
          doc.autoTable({
            startY: y, margin:{ left:mg, right:mg, top:BODY_Y },
            head: [['#','Código','Nombre','Categoría','Meta','Resultado','Observaciones','Estado']],
            body: indicadores.map((ind,i) => [
              i+1, ind.codigo??'—', ind.nombre??'—', ind.categoria??'—',
              ind.meta??'—', ind.resultado??'—', ind.observaciones??'—',
              ind.estado?.replace('_',' ')??'—',
            ]),
            theme:'striped',
            headStyles:{ fillColor:[245,158,11], textColor:255, fontSize:7, fontStyle:'bold' },
            bodyStyles:{ fontSize:7 },
            alternateRowStyles:{ fillColor:[255,251,235] },
            columnStyles:{ 0:{cellWidth:7}, 1:{cellWidth:16}, 2:{cellWidth:35}, 3:{cellWidth:22}, 4:{cellWidth:16}, 5:{cellWidth:16}, 6:{cellWidth:30}, 7:{cellWidth:16} },
            willDrawPage: ()=>drawHeader(),
          })
          y = doc.lastAutoTable.finalY + 8
        }
      }

      // ── Resumen de adherencia ──
      ensureSpace(60)
      sectionBar('R', 'Resumen de Adherencia y Cumplimiento', 51, 65, 85)
      const BW = 90, BH = 7, LW = 65
      const barras = [
        tipos.includes('asistencias')    && { label:'Asistencias técnicas',     ok: asistencias.filter(a=>a.cumplido).length,     total:asistencias.length,    r:0,g:120,b:192 },
        tipos.includes('tareas')         && { label:'Tareas',                   ok: tareas.filter(t=>t.estado==='completada').length, total:tareas.length,      r:16,g:185,b:129},
        tipos.includes('capacitaciones') && { label:'Capacitaciones (3/3 ses)', ok: capacitaciones.filter(c=>c.sesion1==='completado'&&c.sesion2==='completado'&&c.sesion3==='completado').length, total:capacitaciones.length, r:111,g:66,b:193 },
        tipos.includes('indicadores')    && { label:'Indicadores al día',       ok: indicadores.filter(i=>i.estado==='al_dia').length, total:indicadores.length, r:245,g:158,b:11 },
      ].filter(Boolean) as any[]

      for (const b of barras) {
        const pct = b.total > 0 ? Math.round((b.ok/b.total)*100) : 0
        ensureSpace(BH + 8)
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(b.r,b.g,b.b)
        doc.text(b.label, mg, y+BH-1)
        hBar(mg+LW, y, BW, BH, pct, b.r, b.g, b.b)
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(20,20,20)
        doc.text(`${pct}%  (${b.ok}/${b.total})`, mg+LW+BW+4, y+BH-1)
        y += BH + 6
      }

      // ── Numerar páginas ──
      const totalPgs = doc.getNumberOfPages()
      for (let pg = 1; pg <= totalPgs; pg++) {
        doc.setPage(pg)
        doc.setFillColor(255,255,255)
        doc.rect(C2X+1, HDR_Y+17.5, pW-C2X-mg-1.5, 5, 'F')
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(20,20,20)
        doc.text(`Página ${pg} de ${totalPgs}`, C2X+3, HDR_Y+21.5)
      }

      const fileName = `consulta-${MESES[periodo.mes].toLowerCase()}-${periodo.anio}${desde||hasta ? `-${desde||''}${hasta?'_'+hasta:''}` : ''}.pdf`
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: join(app.getPath('documents'), fileName),
        filters: [{ name:'PDF', extensions:['pdf'] }],
      })
      if (!filePath) return { ok: false }
      writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')))
      return { ok: true, ruta: filePath }
    } catch (e: any) {
      console.error('[consulta:generarPDF] Error:', e?.message ?? e)
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
}
