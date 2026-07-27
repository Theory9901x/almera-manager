# SGIMR — Guía del proyecto para agentes

Sistema de Gestión Integral Modular (SGIMR / "Almera Manager") para la **ESE Salud
Yopal**. Plataforma web multi-entidad donde cada módulo cubre un proceso de calidad
en salud. En producción en `https://sgimr.cloud`.

Este documento es el punto de entrada. Léelo completo antes de tocar código.

---

## 1. Stack y estructura

| Capa | Tecnología |
|---|---|
| Front | React 18 + TypeScript + Vite 8, React Router 6 |
| Estilos | CSS propio en `src/index.css` (~2.6k líneas) + Tailwind (solo utilidades de layout) |
| UI | Radix UI (select/popover/dropdown), framer-motion, lucide-react |
| Gráficas | ECharts 6 (`echarts-for-react`) — motor único, no hay Recharts/Nivo |
| API | Node + Express 5 (ESM, `.mjs`) |
| BD | PostgreSQL (`pg`) |
| PDF | Puppeteer (genera informes en el server) + `pdfjs-dist` (visor en el cliente) |
| Proceso | PM2 tras nginx en un VPS Ubuntu 24.04 |

```
server/
  index.mjs        Arranque Express, headers de seguridad, static de /uploads, SSR de meta tags
  db.mjs           Pool pg + migrate() (aplica schema.sql al arrancar) + bootstrap()
  auth.mjs         Sesión por cookie, RBAC, derivación de permisos
  security.mjs     Hash de password y de token de sesión
  pdf.mjs          Puppeteer compartido para renderizar HTML → PDF
  schema.sql       ÚNICA fuente de verdad del esquema (idempotente)
  routes/          auth, admin, almera, adherence, surveys, surveysPublic, carbon
  templates/       HTML de los informes PDF
src/
  App.tsx          Rutas + guardas por permiso
  index.css        Tokens CSS y todo el estilo del sistema
  design-system/   Componentes y tokens compartidos (ver §5)
  platform/        Login, layout/sidebar, páginas administrativas y de plataforma
  modules/         adherence · almera · carbon · surveys
  shared/          Utilidades y UI heredada (evitar ampliar)
scripts/
  deploy-manual.sh Despliegue manual al VPS
```

### Comandos

```bash
npm run dev      # Express + Vite en modo dev
npm run check    # tsc --noEmit  ← obligatorio antes de commitear
npm run build    # vite build
```

`package.json` declara `node >=22 <25`. **El VPS corre Node 20**, por eso el deploy
imprime avisos `EBADENGINE`. Es ruido conocido, no un fallo; no intentes "arreglarlo"
bajando el engine sin hablarlo.

---

## 2. Base de datos y migraciones

**No hay carpeta de migraciones.** `server/schema.sql` es un script idempotente
(`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
`INSERT ... ON CONFLICT DO UPDATE`) que `migrate()` ejecuta **en cada arranque del
proceso Node**.

Consecuencias prácticas:

- Para cambiar el esquema, **edita `schema.sql`** y añade sentencias idempotentes al
  final de la sección del módulo. Nunca escribas un `ALTER` destructivo.
- La migración corre al recargar PM2, leyendo el `schema.sql` de donde apunte el
  symlink `current` **en ese instante**. Por eso el orden del script de deploy es
  crítico (ver §7).
- Las organizaciones existentes **no reciben módulos nuevos automáticamente** (el
  auto-enable solo corre al crear una organización). Hay que hacer *backfill*
  explícito en `schema.sql`; hay ejemplo en la sección de Huella de Carbono.

Tablas por dominio: núcleo (`organizations`, `users`, `roles`, `memberships`,
`permissions`, `modules`, `sessions`…), ALMERA, auditorías, `adherence_*`,
`survey_*`, `carbon_*`.

---

## 3. RBAC — modelo de 3 niveles

Definido en `server/auth.mjs`.

- **SUPERADMIN / ADMIN** (`ADMIN_TIER_ROLES`): reciben **todos** los permisos y todos
  los módulos habilitados para la entidad. No pasan por ningún mapa.
- **USUARIO**: sus permisos se **derivan** de los módulos que se le habilitaron, vía
  `USUARIO_MODULE_PERMISSIONS`. Si añades un módulo, tienes que decidir qué recibe un
  USUARIO común y agregarlo a ese mapa, o no verá nada.

Casos particulares ya existentes:

- `surveys` da a un USUARIO permisos completos de constructor (`create/edit/delete/export`),
  porque es una herramienta de autoría, no un módulo de consulta.
- `carbon.manage` se deja **fuera** del mapa a propósito: solo admin-tier lo obtiene.
- `adherence-matrix` no usa el mapa: depende de `membership_modules.function_key`
  (`AUDITOR` o `PROFESIONAL`), ver `ADHERENCE_FUNCTION_PERMISSIONS`.

Tres condiciones deben cumplirse para que alguien vea un módulo: **módulo activo** +
**habilitado para la entidad** (`organization_modules`) + **asignado** (admin-tier por
rol, USUARIO por `membership_modules`).

---

## 4. Reglas de trabajo (no negociables)

1. **Desplegar exige autorización fresca y explícita.** No ejecutes
   `scripts/deploy-manual.sh` salvo que el usuario diga "despliega" **en ese mismo
   turno**. Una autorización de un turno anterior nunca se arrastra. Lo mismo para
   cambios en el VPS (nginx, `apt install`, tocar la BD de producción).
2. **Commit + push a `origin/main` al terminar un trabajo, sin preguntar.** El deploy
   es lo único que requiere confirmación.
3. **Verifica visualmente antes de entregar** (ver §6). No afirmes que algo se ve bien
   sin haberlo mirado. Nunca inventes un screenshot ni des por hecho un resultado.
4. **Nada de Docker** para BD ni pruebas locales en este proyecto.
5. **Limpia los archivos temporales** (`_test_*`, `_test_dist/`) antes de commitear.
6. `npm run check` y `npm run build` en verde antes de commitear.
7. Los comentarios del código están **en español y sin tildes** (el código fuente evita
   acentos en comentarios; los textos de interfaz sí llevan tildes). Sigue esa
   convención y explica **el porqué**, no el qué.

---

## 5. Sistema de diseño

Todo vive en `src/design-system/` (tokens + componentes) y `src/index.css` (variables
y clases). **Ningún módulo define colores, sombras o radios sueltos.**

### 5.1 Dos vocabularios de color que nunca se mezclan

| | Para qué | Dónde |
|---|---|---|
| **Identidad de módulo** | "¿en qué módulo estoy?" | Hero, badge, tab activa, botón primario, iconos propios del módulo |
| **Semáforo** | "¿qué tan bien va esto?" | Porcentajes, estados, badges de concepto |

El semáforo es **universal**: un 85 % se ve igual en todos los módulos.
`tokens.ts` → `semaphoreColor()`, `semaphoreLevel()`:
≥90 Óptimo · ≥80 Aceptable · ≥70 Deficiente · <70 Muy deficiente.

Usar el color de identidad para un estado semántico (o al revés) es un bug.

### 5.2 Paleta armónica OKLCH (11 tonos)

En `src/index.css` (`--m-*`): misma luminosidad (0.55) y croma (0.16), solo cambia el
tono, para que **ningún módulo pese visualmente más que otro**.

| Token | Tono | Módulo |
|---|---|---|
| `--m-asistencias` | 25 | Asistencias Técnicas / ALMERA |
| `--m-matrices` | 300 | Matrices de Adherencia |
| `--m-auditorias` | 260 | Auditorías Internas |
| `--m-encuestas` | 195 | Encuestas |
| `--m-huella` | 155 | Huella de Carbono |
| `--m-usuarios` | 350 | Usuarios / Admin |
| `--m-planes` | 130 | **libre** (`#518200`) |
| `--m-documentos` | 230 | **libre** (`#007fbc`) |
| `--m-seguridad` | 40 | **libre** (`#bb4717`) |
| `--m-riesgos` | 70 | **libre** (`#aa5b00`) |
| `--m-indicadores` | 330 | **libre** (`#a3489d`) |

Cada uno tiene su `-soft` (`oklch(0.95 0.03 <tono>)`) para fondos.

**`tokens.ts` → `MODULE_IDENTITIES` debe replicar el color en hex literal**, porque hay
código JS que concatena alpha así: `` `${identity.color}18` ``. Eso no funciona con un
string `oklch(...)`. Los hex de arriba ya están calculados; si necesitas otro, se
obtiene pintando el color en un `<canvas>` y leyendo `getImageData` (no uses
`getComputedStyle`: Chrome a veces devuelve el `oklch()` sin convertir).

### 5.3 Componentes clave

- **`ModuleHero`** — cabecera oscura estándar de todo módulo. Props: `badge`, `title`,
  `subtitle?`, `accent`, `actions?`, `className?`, `children?`. Es *el* header; no
  hagas headers a mano. Variante rica: `className="matrices-hero"` (textura de malla
  de puntos) + `<div className="hero-stat-inline">` para estadísticas en vivo.
- **`Card`** — `accent` pinta la franja superior de identidad. **Nunca anides Card
  dentro de Card.**
- `Button` (`identity` para el gradiente del primario), `Select`, `Input`, `DatePicker`
  (reemplaza `<input type="date">` nativo en todo el sistema), `Table`, `Badge`,
  `SemaphoreBadge`, `EmptyState`, `SaveStatusIndicator`, `Charts` (`BarChart`,
  `LineChart`, `RadialGauge`, `DonutChart`).
- Galería viva en `/app/design-system`.

### 5.4 Reglas visuales aprendidas

- El fondo de página de un módulo puede llevar un radial muy sutil de su identidad
  (patrón `.matrices-page-bg`), nunca gris plano.
- En tablas densas **las líneas divisorias sí van**: son funcionales, no decorativas.
  Es la excepción a "sin líneas".
- Números en tablas: `font-variant-numeric: tabular-nums`.
- Un contenedor con `.surface-panel.is-header` **debe** fijar `--ds-accent` inline, o
  su franja cae al rojo institucional por defecto y choca con el color del módulo.
  Ese bug ya apareció tres veces.

---

## 6. Verificación visual obligatoria (Puppeteer)

No hay credenciales para navegar la app autenticada en local. El método probado es
montar los componentes **reales** con datos falsos y fotografiarlos en Chrome:

1. `_test_harness.tsx` — monta el componente real + `./src/index.css` con datos mock.
2. `_test_harness.html` — `<div id="root">` + script al harness.
3. `_test_vite.config.ts` — `outDir: '_test_dist'`, `rollupOptions.input` al HTML.
4. `_test_screenshot.cjs` — servidor `http` estático sobre `_test_dist` + Puppeteer;
   captura `page.on('console')` y `page.on('pageerror')`, `fullPage: true`.

```bash
npx vite build --config _test_vite.config.ts && node _test_screenshot.cjs
```

Luego **mira la imagen** con la herramienta Read. Al terminar:

```bash
rm -f _test_harness.tsx _test_harness.html _test_vite.config.ts _test_screenshot.cjs _test_screenshot.png
rm -rf _test_dist
```

Este flujo ya evitó enviar a producción: texto blanco sobre blanco, subitems del
sidebar en línea en vez de apilados, y un crash de ECharts. Un 404 suelto en consola
es ruido normal del harness.

Para verificar contra **producción real** (útil tras desplegar) se puede correr
Puppeteer *en el VPS*, que sí tiene la app servida:
`scp` el script a `/opt/sgimr/current/` y ejecutarlo desde ahí (necesita resolver
`puppeteer` desde los `node_modules` del release).

---

## 7. Despliegue e infraestructura

```bash
bash scripts/deploy-manual.sh    # SOLO con "despliega" explícito en el turno
```

- Host `root@sgimr.cloud`, llave `~/.ssh/sgimr_github_actions`, base `/opt/sgimr`.
- Estructura: `releases/<timestamp>-<sha>/`, symlink `current`, `shared/.env`,
  `shared/uploads/`.
- **Orden crítico (no lo cambies):** subir release → `npm ci --omit=dev` → *recién
  entonces* mover el symlink `current` → recargar PM2. Si recargas PM2 antes de mover
  el symlink, se re-aplica el `schema.sql` **viejo** en silencio (exit 0) y el deploy
  queda a medias.
- Verificación final: `curl https://sgimr.cloud/api/health` → 200.
- PM2: app `sgimr`, puerto 3100. En el mismo VPS convive `redsalud-campus` (otro
  proyecto, no tocar).

### Estado del servidor (instalado manualmente, no versionado)

| Cosa | Valor | Por qué |
|---|---|---|
| nginx `client_max_body_size` | **60m** | Subir presentaciones de encuestas |
| `libreoffice-impress` | instalado | Convertir PPT/PPTX → PDF |
| `librsvg2-bin` (`rsvg-convert`) | instalado | Rasterizar SVG antes de convertir |
| `zip` / `unzip`, `poppler-utils` | instalados | Reempaquetar pptx, QA de PDF |
| Fuentes `fonts-crosextra-carlito/caladea` | instaladas | Métricas Calibri/Cambria |

Si se reconstruye el VPS, **hay que reinstalar todo esto** o la conversión de
presentaciones deja de funcionar (falla en silencio y cae al archivo original).

### Archivos subidos

`shared/uploads/{surveys,carbon,adherence,almera}`. **`surveys` es público sin auth**
(se sirve en `/uploads/surveys`) porque su contenido se muestra en el enlace público de
la encuesta; los demás módulos solo permiten descarga autenticada. Tenlo presente al
guardar algo sensible.

---

## 8. Estado por módulo

| Módulo | Key | Ruta | Estado |
|---|---|---|---|
| Inicio | `dashboard` | `/app` | Rediseñado (bento, hero) |
| Gestión ALMERA | `almera` | `/app/modulos/almera` | Operativo |
| Asistencias Técnicas | `technical-assistances` | `/app/modulos/technical-assistances` | Operativo, rediseñado |
| Auditorías Internas | `internal-audits` | — | **Inactivo** (`active = FALSE`) |
| Matrices de Adherencia | `adherence-matrix` | `/app/adherencia/*` | Operativo, rediseñado |
| Encuestas | `surveys` | `/app/encuestas/*` + público `/e/:slug` | Operativo, rediseñado |
| Huella de Carbono | `carbon-footprint` | `/app/huella-carbono/*` | Operativo, rediseñado |
| Listas de Chequeo | `checklists` | `/app/listas-chequeo/*` | **Fases 1-2**: constructor, motor y diligenciamiento |
| Administración | `admin`, `users`, `roles`, `entity`, `settings`, `reports` | `/app/administracion/*` | Operativo |

**Matrices de Adherencia** es el hermano conceptual del módulo pendiente: mide
adherencia por área con ámbitos → criterios ponderados, escala 0/1/2/NA, exclusión de
NA del denominador, semáforo por concepto, planes de mejora y firmas. El motor está en
`computeCompliance()` (`server/routes/adherence.mjs`) — **léelo antes de escribir el
motor de Listas de Chequeo.**

**Encuestas** es el hermano estructural: constructor (páginas → preguntas con config
JSON) + entorno público de diligenciamiento, con guardado explícito, adjuntos por
página y visor propio de PDF.

---

## 9. Receta: agregar un módulo nuevo

1. **`schema.sql`** — al final, en su propia sección comentada:
   `INSERT INTO modules (...) ON CONFLICT DO UPDATE` · backfill de
   `organization_modules` para entidades existentes · `INSERT INTO permissions` ·
   tablas del dominio.
2. **`server/auth.mjs`** — añadir la entrada en `USUARIO_MODULE_PERMISSIONS`.
3. **`server/routes/<modulo>.mjs`** + montarlo en `server/index.mjs` bajo `requireAuth`.
4. **`src/index.css`** — asignarle un `--m-*` libre (§5.2).
5. **`src/design-system/tokens.ts`** — su entrada hex en `MODULE_IDENTITIES`.
6. **`src/modules/<modulo>/`** — `types.ts`, `services/`, `pages/`, `components/`.
7. **`src/App.tsx`** — rutas con guarda de permiso.
8. **`src/platform/layout/AppLayout.tsx`** — icono en el sidebar (mapa `icons`).
   Ojo: el filtro `otherModules` excluye explícitamente `dashboard`, `admin` y
   `adherence-matrix`; revisa si tu módulo necesita trato especial.

---

## 10. Trampas ya encontradas (no las repitas)

- **ECharts CJS/ESM**: importar `echarts-for-react/lib/core` puede resolver al objeto
  del módulo en vez de la clase → React error #130. Usa `echarts-for-react/esm/core`.
- **`X-Frame-Options: DENY`** global bloquea también los iframes **del propio sitio**.
  `/uploads/surveys` lo relaja a `SAMEORIGIN` para poder embeber PDF.
- **Subidas que fallan sin log**: si nginx corta por tamaño, la petición nunca llega a
  Node, así que no hay error en la app. Mira `client_max_body_size` primero.
- **LibreOffice se cuelga con SVG complejos** (iconos tipo Canva con `mask`+`filter`):
  no tarda, **nunca termina**. Por eso se rasterizan los SVG a PNG antes de convertir.
- **`COALESCE(nuevo, columna)` en un PATCH** impide poner un campo a `NULL`. Si el
  campo se debe poder limpiar, arma el `SET` dinámicamente.
- **Grid "huérfano"**: un layout hero+N secundarios en grilla plana deja el último
  elemento solo en una fila. Patrón `.ds-bento-split` + `.ds-bento-secondary-grid`.
- **Caché del navegador** tras arreglar un header/asset: pide `Ctrl+Shift+R` antes de
  volver a diagnosticar.

---

## 11. Trabajo pendiente

**Módulo "Listas de Chequeo" (auditoría por adherencia)** — plan de 5 fases.
**Fases 1 y 2 entregadas**; **faltan las fases 3 a 5**:

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Modelo, constructor, motor de adherencia, semaforización | **Hecha** |
| 2 | Entorno de diligenciamiento (tablet) + directorio de sujetos | **Hecha** |
| 3 | Firmas digitales en canvas + directorio de firmantes | Pendiente |
| 4 | Analítica, gráficas e informes PDF | Pendiente |
| 5 | Migración de las 13 listas reales de seguridad del paciente | Pendiente |

Pieza clave ya disponible: `server/checklistScoring.mjs` (motor puro; cubre los cuatro
niveles de agregación y el conteo de pendientes). La tabla `checklist_signatures` existe
desde la Fase 1 pero aún no tiene interfaz — es el punto de partida de la Fase 3.

→ **`docs/MODULO-LISTAS-DE-CHEQUEO.md`** tiene el plan completo, el modelo, la decisión
de escala fija C/NC/NA y el análisis real de los dos formatos institucionales. Léelo
antes de continuar.
