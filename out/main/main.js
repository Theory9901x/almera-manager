import { app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import { join, basename, extname } from "path";
import Database from "better-sqlite3";
import { readFileSync, copyFileSync, existsSync, mkdirSync } from "fs";
import "node-notifier";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const DB_PATH = join(app.getPath("userData"), "almera.db");
const SCHEMA_PATH = join(__dirname, "../../db/schema.sql");
let _db = null;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    const schema = readFileSync(SCHEMA_PATH, "utf-8");
    _db.exec(schema);
  }
  return _db;
}
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
function registerGestionHandlers() {
  const db = getDb();
  ipcMain.handle("indicadores:listar", (_, periodo_id) => {
    return db.prepare("SELECT * FROM indicadores WHERE periodo_id = ? ORDER BY codigo").all(periodo_id);
  });
  ipcMain.handle("indicadores:crear", (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO indicadores (periodo_id, codigo, nombre, categoria, estado, meta, resultado, observaciones)
      VALUES (@periodo_id, @codigo, @nombre, @categoria, @estado, @meta, @resultado, @observaciones)
    `);
    const result = stmt.run(data);
    return db.prepare("SELECT * FROM indicadores WHERE id = ?").get(result.lastInsertRowid);
  });
  ipcMain.handle("indicadores:actualizar", (_, id, data) => {
    db.prepare(`
      UPDATE indicadores SET
        codigo = @codigo, nombre = @nombre, categoria = @categoria,
        estado = @estado, meta = @meta, resultado = @resultado,
        observaciones = @observaciones, actualizado_en = datetime('now')
      WHERE id = ${id}
    `).run(data);
    return db.prepare("SELECT * FROM indicadores WHERE id = ?").get(id);
  });
  ipcMain.handle("indicadores:eliminar", (_, id) => {
    db.prepare("DELETE FROM indicadores WHERE id = ?").run(id);
    return { ok: true };
  });
  ipcMain.handle("planes:listar", (_, periodo_id) => {
    return db.prepare(`
      SELECT p.*, i.nombre AS indicador_nombre
      FROM planes_mejora p
      LEFT JOIN indicadores i ON i.id = p.indicador_id
      WHERE p.periodo_id = ?
      ORDER BY p.fecha_limite ASC
    `).all(periodo_id);
  });
  ipcMain.handle("planes:crear", (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO planes_mejora (indicador_id, periodo_id, descripcion, responsable, fecha_limite, estado, avance)
      VALUES (@indicador_id, @periodo_id, @descripcion, @responsable, @fecha_limite, @estado, @avance)
    `);
    const result = stmt.run(data);
    return db.prepare("SELECT * FROM planes_mejora WHERE id = ?").get(result.lastInsertRowid);
  });
  ipcMain.handle("planes:actualizar", (_, id, data) => {
    db.prepare(`
      UPDATE planes_mejora SET
        descripcion = @descripcion, responsable = @responsable,
        fecha_limite = @fecha_limite, estado = @estado, avance = @avance
      WHERE id = ${id}
    `).run(data);
    return db.prepare("SELECT * FROM planes_mejora WHERE id = ?").get(id);
  });
  ipcMain.handle("planes:eliminar", (_, id) => {
    db.prepare("DELETE FROM planes_mejora WHERE id = ?").run(id);
    return { ok: true };
  });
}
function getEvidenciasDir() {
  const dir = join(app.getPath("userData"), "evidencias");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
function registerEvidenciasHandlers() {
  const db = getDb();
  ipcMain.handle("evidencias:listar", (_, periodo_id) => {
    return db.prepare(`
      SELECT e.*, i.nombre AS indicador_nombre
      FROM evidencias e
      LEFT JOIN indicadores i ON i.id = e.indicador_id
      WHERE e.periodo_id = ?
      ORDER BY e.fecha_carga DESC
    `).all(periodo_id);
  });
  ipcMain.handle("evidencias:abrirDialogo", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Seleccionar evidencia",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documentos", extensions: ["pdf", "xlsx", "xls", "docx", "doc"] },
        { name: "Imágenes", extensions: ["png", "jpg", "jpeg"] },
        { name: "Todos", extensions: ["*"] }
      ]
    });
    if (canceled) return [];
    return filePaths;
  });
  ipcMain.handle("evidencias:cargar", (_, data) => {
    const dir = getEvidenciasDir();
    const insertados = [];
    for (const rutaOrigen of data.rutas) {
      const nombre = basename(rutaOrigen);
      const ext = extname(nombre).replace(".", "").toLowerCase();
      const destino = join(dir, `${Date.now()}_${nombre}`);
      copyFileSync(rutaOrigen, destino);
      const tipo = ["pdf"].includes(ext) ? "pdf" : ["xlsx", "xls"].includes(ext) ? "xlsx" : ["png", "jpg", "jpeg"].includes(ext) ? "img" : "otro";
      const stmt = db.prepare(`
        INSERT INTO evidencias (periodo_id, indicador_id, nombre_archivo, ruta, tipo, descripcion)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        data.periodo_id,
        data.indicador_id ?? null,
        nombre,
        destino,
        tipo,
        data.descripcion ?? ""
      );
      insertados.push(db.prepare("SELECT * FROM evidencias WHERE id = ?").get(result.lastInsertRowid));
    }
    return insertados;
  });
  ipcMain.handle("evidencias:eliminar", (_, id) => {
    db.prepare("DELETE FROM evidencias WHERE id = ?").run(id);
    return { ok: true };
  });
  ipcMain.handle("evidencias:abrirArchivo", (_, ruta) => {
    shell.openPath(ruta);
    return { ok: true };
  });
}
function registerTareasHandlers() {
  const db = getDb();
  ipcMain.handle("tareas:listar", (_, periodo_id) => {
    const query = periodo_id ? "SELECT * FROM tareas WHERE periodo_id = ? ORDER BY prioridad DESC, fecha_limite ASC" : "SELECT * FROM tareas WHERE estado != 'completada' ORDER BY prioridad DESC, fecha_limite ASC";
    return db.prepare(query).all(periodo_id ?? []);
  });
  ipcMain.handle("tareas:crear", (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO tareas (periodo_id, titulo, descripcion, prioridad, estado, fecha_limite)
      VALUES (@periodo_id, @titulo, @descripcion, @prioridad, @estado, @fecha_limite)
    `);
    const result = stmt.run(data);
    return db.prepare("SELECT * FROM tareas WHERE id = ?").get(result.lastInsertRowid);
  });
  ipcMain.handle("tareas:actualizar", (_, id, data) => {
    db.prepare(`
      UPDATE tareas SET
        titulo = @titulo, descripcion = @descripcion,
        prioridad = @prioridad, estado = @estado, fecha_limite = @fecha_limite
      WHERE id = ${id}
    `).run(data);
    return db.prepare("SELECT * FROM tareas WHERE id = ?").get(id);
  });
  ipcMain.handle("tareas:completar", (_, id) => {
    db.prepare(`
      UPDATE tareas SET estado = 'completada', completada_en = datetime('now') WHERE id = ?
    `).run(id);
    return { ok: true };
  });
  ipcMain.handle("tareas:eliminar", (_, id) => {
    db.prepare("DELETE FROM tareas WHERE id = ?").run(id);
    return { ok: true };
  });
}
function registerPeriodosHandlers() {
  const db = getDb();
  ipcMain.handle("periodos:listar", () => {
    return db.prepare("SELECT * FROM periodos ORDER BY anio DESC, mes DESC").all();
  });
  ipcMain.handle("periodos:obtener", (_, id) => {
    return db.prepare("SELECT * FROM periodos WHERE id = ?").get(id);
  });
  ipcMain.handle("periodos:crear", (_, data) => {
    const stmt = db.prepare("INSERT OR IGNORE INTO periodos (anio, mes, notas) VALUES (?, ?, ?)");
    const result = stmt.run(data.anio, data.mes, data.notas ?? "");
    return db.prepare("SELECT * FROM periodos WHERE id = ?").get(result.lastInsertRowid);
  });
  ipcMain.handle("periodos:cerrar", (_, id) => {
    db.prepare("UPDATE periodos SET estado = 'cerrado' WHERE id = ?").run(id);
    return { ok: true };
  });
}
function registerActividadesHandlers() {
  const db = getDb();
  ipcMain.handle("actividades:listar", (_, periodo_id) => {
    return db.prepare("SELECT * FROM actividades WHERE periodo_id = ? ORDER BY fecha DESC").all(periodo_id);
  });
  ipcMain.handle("actividades:crear", (_, data) => {
    const stmt = db.prepare(`
      INSERT INTO actividades (periodo_id, tipo, descripcion, duracion_min, fecha)
      VALUES (@periodo_id, @tipo, @descripcion, @duracion_min, @fecha)
    `);
    const result = stmt.run(data);
    return db.prepare("SELECT * FROM actividades WHERE id = ?").get(result.lastInsertRowid);
  });
  ipcMain.handle("actividades:eliminar", (_, id) => {
    db.prepare("DELETE FROM actividades WHERE id = ?").run(id);
    return { ok: true };
  });
}
function registerNotificacionesHandlers() {
  const db = getDb();
  ipcMain.handle("notificaciones:listar", () => {
    return db.prepare("SELECT * FROM notificaciones ORDER BY creado_en DESC LIMIT 50").all();
  });
  ipcMain.handle("notificaciones:marcarLeida", (_, id) => {
    db.prepare("UPDATE notificaciones SET leida = 1 WHERE id = ?").run(id);
    return { ok: true };
  });
  ipcMain.handle("notificaciones:limpiar", () => {
    db.prepare("DELETE FROM notificaciones WHERE leida = 1").run();
    return { ok: true };
  });
}
function registerInformesHandlers() {
  const db = getDb();
  ipcMain.handle("informes:generarPDF", async (_, periodo_id) => {
    try {
      const jsPDF = (await import("jspdf")).default;
      await import("jspdf-autotable");
      const periodo = db.prepare("SELECT * FROM periodos WHERE id = ?").get(periodo_id);
      const indicadores = db.prepare("SELECT * FROM indicadores WHERE periodo_id = ?").all(periodo_id);
      const planes = db.prepare("SELECT * FROM planes_mejora WHERE periodo_id = ?").all(periodo_id);
      const evidencias = db.prepare("SELECT * FROM evidencias WHERE periodo_id = ?").all(periodo_id);
      const tareas = db.prepare("SELECT * FROM tareas WHERE periodo_id = ?").all(periodo_id);
      const MESES = [
        "",
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre"
      ];
      const doc = new jsPDF();
      const titulo = `Informe de gestión — ${MESES[periodo.mes]} ${periodo.anio}`;
      doc.setFontSize(18);
      doc.setTextColor(59, 91, 219);
      doc.text("Almera Manager", 14, 20);
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text(titulo, 14, 30);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generado: ${(/* @__PURE__ */ new Date()).toLocaleDateString("es-CO")}`, 14, 38);
      doc.line(14, 42, 196, 42);
      let y = 50;
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text("Resumen del período", 14, y);
      y += 8;
      const resumen = [
        ["Indicadores", String(indicadores.length)],
        ["Al día", String(indicadores.filter((i) => i.estado === "al_dia").length)],
        ["En riesgo", String(indicadores.filter((i) => i.estado === "en_riesgo").length)],
        ["Críticos", String(indicadores.filter((i) => i.estado === "critico").length)],
        ["Tareas completadas", String(tareas.filter((t) => t.estado === "completada").length)],
        ["Evidencias", String(evidencias.length)]
      ];
      doc.autoTable({
        startY: y,
        head: [["Métrica", "Valor"]],
        body: resumen,
        theme: "striped",
        headStyles: { fillColor: [59, 91, 219] },
        margin: { left: 14 }
      });
      y = doc.lastAutoTable.finalY + 10;
      if (indicadores.length > 0) {
        doc.setFontSize(11);
        doc.text("Indicadores", 14, y);
        y += 4;
        doc.autoTable({
          startY: y,
          head: [["Código", "Nombre", "Estado", "Meta", "Resultado"]],
          body: indicadores.map((i) => [i.codigo ?? "", i.nombre, i.estado, i.meta ?? "", i.resultado ?? ""]),
          theme: "striped",
          headStyles: { fillColor: [59, 91, 219] },
          margin: { left: 14 }
        });
        y = doc.lastAutoTable.finalY + 10;
      }
      if (planes.length > 0) {
        doc.setFontSize(11);
        doc.text("Planes de mejora", 14, y);
        y += 4;
        doc.autoTable({
          startY: y,
          head: [["Descripción", "Responsable", "Estado", "Avance"]],
          body: planes.map((p) => [p.descripcion, p.responsable ?? "", p.estado, `${p.avance}%`]),
          theme: "striped",
          headStyles: { fillColor: [59, 91, 219] },
          margin: { left: 14 }
        });
      }
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: join(app.getPath("documents"), `informe-${periodo.anio}-${String(periodo.mes).padStart(2, "0")}.pdf`),
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      if (filePath) {
        doc.save(filePath);
        return { ok: true, ruta: filePath };
      }
      return { ok: false };
    } catch (e) {
      console.error("Error generando PDF:", e);
      return { ok: false };
    }
  });
  ipcMain.handle("informes:generarExcel", async (_, periodo_id) => {
    try {
      const XLSX = await import("xlsx");
      const periodo = db.prepare("SELECT * FROM periodos WHERE id = ?").get(periodo_id);
      const indicadores = db.prepare("SELECT * FROM indicadores WHERE periodo_id = ?").all(periodo_id);
      const planes = db.prepare("SELECT * FROM planes_mejora WHERE periodo_id = ?").all(periodo_id);
      const evidencias = db.prepare("SELECT * FROM evidencias WHERE periodo_id = ?").all(periodo_id);
      const tareas = db.prepare("SELECT * FROM tareas WHERE periodo_id = ?").all(periodo_id);
      const actividades = db.prepare("SELECT * FROM actividades WHERE periodo_id = ?").all(periodo_id);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(indicadores), "Indicadores");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planes), "Planes de mejora");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evidencias), "Evidencias");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tareas), "Tareas");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actividades), "Actividades");
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: join(app.getPath("documents"), `informe-${periodo.anio}-${String(periodo.mes).padStart(2, "0")}.xlsx`),
        filters: [{ name: "Excel", extensions: ["xlsx"] }]
      });
      if (filePath) {
        XLSX.writeFile(wb, filePath);
        return { ok: true, ruta: filePath };
      }
      return { ok: false };
    } catch (e) {
      console.error("Error generando Excel:", e);
      return { ok: false };
    }
  });
}
const isDev = !app.isPackaged;
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}
app.whenReady().then(() => {
  registerPeriodosHandlers();
  registerGestionHandlers();
  registerEvidenciasHandlers();
  registerTareasHandlers();
  registerActividadesHandlers();
  registerNotificacionesHandlers();
  registerInformesHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") app.quit();
});
