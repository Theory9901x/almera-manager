# Módulo "Listas de Chequeo" — Auditoría por Adherencia

Estado: **Fases 1 a 4 entregadas** (modelo, constructor, motor, diligenciamiento, firmas,
analítica e informes PDF); **solo falta la fase 5** (cargar las 13 listas reales). Este documento
es el plan completo — ver §8 para las fases y §10-§13 para lo ya construido. Leer primero `CLAUDE.md` (arquitectura,
sistema de diseño y reglas de trabajo).

---

## 1. Qué es y en qué se diferencia de Encuestas

Es un módulo **hermano de Encuestas** en estructura (constructor + entorno de
diligenciamiento) y **hermano de Matrices de Adherencia** en lógica (mide
cumplimiento y produce un porcentaje semaforizado).

La diferencia central y no negociable: **cada lista es una auditoría cuyo resultado es
un porcentaje de ADHERENCIA**. No mide percepción ni opinión, mide cumplimiento
verificable de criterios, ítem por ítem, sobre sujetos auditados reales.

Es un módulo **por áreas/servicios** (Urgencias, Hospitalización, UCI, Consulta
Externa…), igual que Matrices de Adherencia.

---

## 2. Análisis de los formatos reales (verificado, no supuesto)

Los formatos están en `Escritorio/sp/solicituddigitalizacinlistasdechequeo (2)/`:
14 archivos `.xlsx`, **13 listas únicas** (GCM-SPA-FO-41 aparece duplicado).

Se extrajo y leyó el contenido real de los **dos tipos representativos**. Confirman que
el constructor **no puede tener estructura fija**.

### 2.1 Tipo A — `GCM-SPA-FO-24` Ronda Diaria de Seguridad del Paciente

- Código `GCM-SPA-FO-24`, versión 01, actualización 09/10/2024.
- **Cabecera:** Fecha · Responsable · Personal de turno · *Porcentaje de adherencia*
  (calculado).
- **Sujeto auditado = paciente**, con atributos: fecha, cama, servicio/área, nombre,
  documento de identidad y **clasificación del riesgo** (`IDENT` / `RIES` / `ALER`).
- **7 dominios / 17 criterios**, en matriz: criterios en columnas, pacientes en filas.

| Dominio | Criterios |
|---|---|
| Identificar correctamente al paciente | 3 |
| Reducir el riesgo de daño por caída | 3 |
| Atención a la usuaria gestante y el bebé recién nacido | 2 |
| Consentimiento informado | 1 |
| Seguridad en medicamento | 3 |
| El paciente y su autocuidado | 2 |
| Reducir el riesgo de infecciones | 3 |

- Columna final de **Observaciones**.
- **Instructivo por criterio** en una segunda hoja del libro (19 filas): texto de ayuda
  que explica cuándo marcar cada valor. Ejemplo real: *"Marque SI, sonda vesical con
  rótulo con fecha, número de sonda, nombre de quien realiza el procedimiento […]
  Marque NA, no tiene dispositivos"*. **Ese texto debe poder cargarse y mostrarse al
  auditor** mientras diligencia.

### 2.2 Tipo B — `GCM-SPA-FO-26` Ronda de Farmacovigilancia

- Programa Farmacovigilancia.
- **Cabecera:** Centro de atención · Servicio · Fecha · Evaluador · Cargo.
- **Sujeto auditado = colaborador**, con atributos: servicio y cargo (5 columnas).
- **Ítems numerados** (1 … 17) — la numeración real **salta el 12** (va 11 → 13).
- **3 dominios / 16 criterios**:

| Dominio | Ítems |
|---|---|
| Uso seguro de medicamentos | 1–4 |
| Inventario, aseo, orden, limpieza y desinfección | 5–9 |
| Almacenamiento y conservación | 10, 11, 13–17 |

- Fila final **"Cumplimiento de adherencia"** por colaborador. En el papel solo trae
  columnas `C` / `NC`; en la versión digital se unifica a **C / NC / NA** (ver §2.4).
- Columna de **Observaciones**.
- **Firma del colaborador** evaluado (no del auditor).

### 2.3 Diferencias que obligan a un constructor genérico

| Elemento | Tipo A (FO-24) | Tipo B (FO-26) |
|---|---|---|
| Sujeto auditado | Paciente (cama, documento, clasif. riesgo) | Colaborador (servicio, cargo) |
| Campos de cabecera | Fecha, responsable, personal de turno | Centro, servicio, fecha, evaluador, cargo |
| Ítems numerados | No | Sí (con saltos) |
| N.º de dominios | 7 | 3 |
| N.º de criterios | 17 | 16 |
| Quién firma | Responsable de la ronda | Colaborador evaluado |
| Instructivo por criterio | Sí (hoja aparte) | No |

**Por tanto, es configurable por lista (no fijo en código):** los campos de cabecera; el
tipo de sujeto auditado y sus atributos; si los criterios van numerados; la cantidad de
dominios y criterios; y quién firma y cuántas firmas se capturan.

**La escala NO es configurable:** es fija en todo el módulo (§2.4).

Objetivo declarado por la usuaria: *"el constructor debe ser igual para todas las
listas"* — una sola herramienta que arma cualquiera de las 13 mediante configuración,
sin desarrollo nuevo por lista.

### 2.4 Decisión tomada: escala única C / NC / NA

**Todas las listas usan siempre la misma escala de tres valores**, sin importar lo que
traiga el formato en papel:

| Valor | Significado | Efecto en el cálculo |
|---|---|---|
| `C` | Cumple | Suma al numerador y al denominador |
| `NC` | No cumple | Suma solo al denominador |
| `NA` | No aplica | **Se excluye por completo** |

Esto zanja la ambigüedad de los formatos: FO-24 imprime solo `C`/`NC` pero su
instructivo dice *"Marque NA"* en varios criterios, y FO-26 tampoco trae columna de NA
aunque hay criterios que no aplican a todo colaborador. Al unificar:

- **La escala no se configura por lista** — no hay selector de escala en el constructor
  ni tabla de escalas en el modelo.
- **Todo criterio admite NA**, siempre. No hace falta un campo `admite_na`.
- El motor de adherencia tiene **una sola fórmula**, sin ramas por tipo de escala (§4).

### 2.5 Puntos aún por confirmar con la usuaria antes de la Fase 5

1. **Granularidad del instructivo de FO-24.** Los criterios del instructivo no calzan
   1:1 con los de la grilla (el instructivo separa "manilla con datos correctos" y
   "manilla con datos legibles"; la grilla los une). Hay que decidir cuál manda.
2. **Numeración con saltos** (FO-26 va 11 → 13): ¿se corrige o se respeta el formato
   institucional? Mientras no se decida, el número debe ser **texto libre**, no
   autogenerado.

**Resuelto:** los dos archivos `GCM-SPA-FO-41` de la carpeta son la misma lista. Se
carga **una sola vez**; el módulo no debe crear listas duplicadas por código. Conviene
que `checklist_templates` tenga índice único por `(organization_id, code, version)`
para que el error sea imposible por construcción.

---

## 3. Modelo de datos propuesto

Sigue las convenciones de `schema.sql` (idempotente, prefijo por módulo,
`organization_id` en toda tabla de datos). Nombres sugeridos, ajustables:

```
checklist_templates        La lista: código, versión, nombre, area_id, tipo de sujeto,
                           si numera ítems, activa, organization_id
checklist_header_fields    Campos de cabecera configurables (label, tipo, orden, requerido)
checklist_subject_fields   Atributos del sujeto auditado (label, tipo, orden, requerido)
checklist_domains          Dominios/paquetes (nombre, orden) → template
checklist_criteria         Criterios (texto, número opcional, instructivo, orden) → dominio
checklist_assignments      Qué membresía puede diligenciar qué lista

checklist_audits           Una auditoría diligenciada: template, fecha, autor, estado,
                           adherencia calculada, organization_id
checklist_audit_header     Valores de los campos de cabecera de esa auditoría
checklist_subjects         Directorio reutilizable de sujetos (paciente/colaborador/…)
checklist_audit_subjects   Sujetos incluidos en esa auditoría (+ snapshot de atributos)
checklist_answers          Respuesta por (auditoría, sujeto, criterio) + observación
checklist_signatures       Firma: auditoría, persona, rol de firma, imagen, fecha
```

Notas de diseño:

- `checklist_answers.value` es un enum `C` / `NC` / `NA` con `CHECK`, igual para todas
  las listas. Al ser una columna enum y no un booleano, si algún día apareciera un valor
  nuevo se agrega al `CHECK` sin rehacer el modelo — pero **hoy no se expone ninguna
  opción de escala en el constructor**.
- Un criterio sin responder (`NULL`) **no es lo mismo que `NA`**: `NULL` es "falta
  diligenciar" y debe bloquear el cierre de la auditoría; `NA` es una respuesta válida
  que declara que el criterio no aplica.
- El **snapshot de atributos** del sujeto en la auditoría importa: si un colaborador
  cambia de cargo, la auditoría vieja debe seguir mostrando el cargo que tenía.
- La firma se guarda como imagen (data URL o archivo en `shared/uploads/checklists`) y
  **siempre** con persona + fecha, por trazabilidad.

---

## 4. Cálculo de adherencia

Fórmula **única**, igual para todas las listas (la escala es fija, §2.4):

```
Adherencia (%) = C / (C + NC) × 100
```

- El **NA se excluye del denominador**: un criterio que no aplica no penaliza. Es el
  mismo criterio que ya usa Matrices de Adherencia.
- Si un sujeto o dominio queda con **todo NA**, el denominador es 0: la adherencia es
  `null` ("sin dato"), **no 0 %**. Mostrarlo con el gris de `SEMAPHORE_NO_DATA`, nunca
  en rojo — marcar como incumplimiento algo que no aplicaba sería un error de lectura
  clínica.
- El motor recorre dominios y criterios de forma **dinámica** (cada lista tiene distinta
  cantidad), pero la fórmula no cambia por lista.
  Referencia obligada: `computeCompliance()` en `server/routes/adherence.mjs`, que ya
  resuelve la exclusión de NA (ahí, `score === null`) y la agregación por ámbito.
- Se calcula a **cuatro niveles**:
  1. Por **sujeto auditado**.
  2. Por **dominio** (para semaforizar qué paquete falla).
  3. Por **criterio** a lo largo de todos los sujetos (qué ítem se incumple
     transversalmente).
  4. **General** de la auditoría (el porcentaje de la cabecera).

**Semáforo:** usar el del sistema (`semaphoreColor()` en `tokens.ts`), con umbrales
configurables por lista y por defecto ≥90 / 80–89 / 70–79 / <70.

---

## 5. Los dos entornos

### A. Constructor y administración (equipo de calidad)

- Crear lista: código, versión, área/servicio, tipo de sujeto auditado, umbrales de
  semáforo. **No hay selector de escala**: siempre es C / NC / NA.
- Definir dominios y, dentro de cada uno, criterios (texto, numeración opcional,
  **texto de instructivo**).
- Configurar los campos de cabecera y los atributos del sujeto.
- Asignar qué profesionales pueden diligenciar cada lista.
- Vista previa tal como la verá el auditor.
- Publicar / activar.

**Guardado explícito con botón "Guardar"**, no autoguardado — es la decisión ya tomada
para el constructor de Encuestas (ver commit `fdbaef7`): buffer local de cambios,
indicador de "cambios sin guardar", aviso `beforeunload`, y *flush* antes de cualquier
acción estructural que recargue desde el servidor.

### B. Diligenciamiento (auditor asignado) — **tablet-first**

1. "Mis listas": solo las asignadas.
2. Escoge la lista.
3. Diligencia la **cabecera**.
4. Registra el **número de sujetos** y sus datos. **Los sujetos quedan guardados**: en
   auditorías siguientes se traen del directorio sin volver a crearlos.
5. Evalúa criterio por criterio, para cada sujeto (C / NC / NA).
6. **Firma digital** en canvas táctil: responsable y, si aplica, el profesional
   auditado. Los firmantes también quedan en directorio reutilizable.
7. Al guardar, se calcula la adherencia (general, por dominio, por sujeto) y se muestra
   semaforizada.

Diseño **tablet-first**: áreas táctiles amplias, marcado C/NC/NA cómodo con el dedo,
firma sin mouse. La grilla densa de Matrices de Adherencia
(`EvaluationsPanel.tsx`: encabezado sticky, primera columna sticky, celdas pastel con
color semántico) es la referencia de densidad — pero aquí con objetivos táctiles más
grandes.

---

## 6. Resultados, analítica y reportes

- Adherencia semaforizada por lista, dominio, sujeto y criterio.
- Gráficas con los wrappers de ECharts existentes (`BarChart`, `LineChart`,
  `DonutChart`): adherencia por dominio, evolución del servicio en el tiempo, ranking
  de criterios más incumplidos, comparación entre áreas.
- **Informe PDF institucional** de una auditoría (cabecera, resultados, firmas,
  semáforo) — patrón de `server/templates/adherenceReport.mjs` + `pdf.mjs`.
- **Informe consolidado**: filtrar por varias listas / área / rango de fechas y generar
  un agregado para lectura directiva.
- Todo exportable y con trazabilidad de quién audita y cuándo.

---

## 7. Identidad visual

Asignar el slot libre **`--m-seguridad`** (tono 40, naranja) — es el que temáticamente
corresponde a seguridad del paciente:

- `src/index.css`: ya existe `--m-seguridad: oklch(0.55 0.16 40)` y su `-soft`.
- `src/design-system/tokens.ts` → `MODULE_IDENTITIES`:
  `color: '#bb4717'`, `gradientFrom: '#bb4717'`, `gradientTo: '#df7752'`.

Usar `ModuleHero` con ese accent, `Card accent`, componentes base del sistema y el
semáforo compartido. Nada de HTML nativo sin estilo.

---

## 8. Construcción por fases

Cada fase se entrega con **captura del resultado real funcionando** y la **lista de
archivos tocados** (para confirmar que se construye sobre los componentes compartidos,
no como parche aislado). **No avanzar sin verificar la anterior.**

| Fase | Alcance | Entregable verificable |
|---|---|---|
| **1** ✅ | Modelo de datos, constructor de listas por área, motor de adherencia dinámico con exclusión de NA, semaforización. Sin firmas ni analítica. | **Entregada.** Ver §10. |
| **2** ✅ | Entorno de diligenciamiento: asignación, cabecera → sujetos → evaluación → guardado con cálculo. Directorio reutilizable de sujetos. | Un profesional asignado completa una auditoría de principio a fin y ve su adherencia semaforizada. |
| **3** ✅ | Firmas digitales en canvas (tablet), asociación al registro, directorio reutilizable de firmantes. | Firmar una auditoría desde pantalla táctil y ver la firma en el registro. |
| **4** ✅ | Analítica: tableros por dominio/criterio/servicio/evolución, informe PDF individual y consolidado. | PDF institucional generado y tablero con datos reales. |
| **5** | Migración de las listas reales de seguridad del paciente. | FO-24 y FO-26 cargadas **solo con configuración, sin código nuevo por lista**. |

La Fase 5 es **la prueba de fuego del constructor genérico**: empezar por FO-24 (ronda,
audita pacientes) y FO-26 (farmacovigilancia, audita colaboradores, ítems numerados)
justo porque representan los dos tipos. Si esas dos entran sin escribir código nuevo, el
constructor está bien hecho; si no, hay que corregir el modelo antes de seguir con las
11 restantes.

---

## 9. Inventario de formatos

| Código | Nombre | Tipo |
|---|---|---|
| GCM-SPA-FO-24 | Formato ronda diaria de seguridad del paciente | **A** (analizado) |
| GCM-SPA-FO-26 | Lista de chequeo ronda de seguridad — farmacovigilancia | **B** (analizado) |
| GCM-SPA-FO-28 | Administración segura de medicamentos | por analizar |
| GCM-SPA-FO-29 | Reducir el riesgo — atención a pacientes con enfermedad mental | por analizar |
| GCM-SPA-FO-30 | Prevención malnutrición y nutrición | por analizar |
| GCM-SPA-FO-32 | Prácticas seguras en la obtención de ayudas diagnósticas | por analizar |
| GCM-SPA-FO-33 | Uso adecuado de herramientas de reporte | por analizar |
| GCM-SPA-FO-35 | Consentimiento informado | por analizar |
| GCM-SPA-FO-36 | Adherencia a la política de seguridad del paciente | por analizar |
| GCM-SPA-FO-39 | Prevención de caídas | por analizar |
| GCM-SPA-FO-40 | Identificación del paciente | por analizar |
| GCM-SPA-FO-41 | Comunicación efectiva | **duplicado** en la carpeta |
| GCM-SPA-FO-46 | Procedimiento quirúrgico seguro | por analizar |

Para leer un `.xlsx` sin dependencias nuevas: es un ZIP; se expande y se parsean
`xl/sharedStrings.xml` y `xl/worksheets/sheetN.xml`. **Cuidado:** las celdas
auto-cerradas (`<c r="A3" s="4"/>`) desplazan las columnas si el parser solo busca el
par `<c …>…</c>`; hay que contemplar ambas formas.

---

## 10. Fase 1 — entregada

### Archivos

| Archivo | Rol |
|---|---|
| `server/checklistScoring.mjs` | **Motor de adherencia**, función pura y sin dependencias |
| `server/schema.sql` (sección final) | Módulo, permisos, backfill y 11 tablas del dominio |
| `server/routes/checklists.mjs` | CRUD del constructor + guardado atómico + simulación |
| `server/auth.mjs` | Permisos de USUARIO del módulo |
| `server/index.mjs` | Monta `/api/checklists` bajo `requireAuth` |
| `src/modules/checklists/types.ts` | Tipos compartidos y etiquetas de la escala |
| `src/modules/checklists/services/checklistsService.ts` | Cliente HTTP |
| `src/modules/checklists/pages/ChecklistsListPage.tsx` | Listado y alta de listas |
| `src/modules/checklists/pages/ChecklistBuilderPage.tsx` | Constructor (3 pestañas) |
| `src/design-system/tokens.ts` | Identidad `checklists` (`#bb4717`) |
| `src/index.css` (sección final) | Estilos del módulo |
| `src/App.tsx`, `src/platform/layout/AppLayout.tsx` | Rutas y sidebar |

### Decisiones tomadas al implementar

- **Guardado atómico de estructura.** El constructor manda dominios, criterios y campos
  en un solo `PUT /:id/structure` dentro de una transacción, en vez de decenas de
  llamadas granulares. Encaja con el botón "Guardar" explícito y evita dejar la lista a
  medio guardar si falla una llamada intermedia.
- **Ids temporales del cliente.** Lo que no es un entero (`new_dom_a1b2`) se trata como
  alta. Así el constructor arma la estructura completa sin pedirle ids al servidor.
- **Un criterio ya respondido no se borra**, se marca `active = FALSE`. Borrarlo
  arrastraría por FK las respuestas de auditorías anteriores. El motor ignora los
  inactivos, así que los históricos se conservan sin ensuciar el cálculo.
- **Una lista con auditorías no se elimina**, se archiva (el `DELETE` responde 409).
- **Catálogo propio de áreas** (`checklist_areas`) en vez de reusar `adherence_areas`:
  allá un "área" posee una matriz versionada y su ciclo de vida es otro.
- **Índice único parcial** por `(organization_id, code, version)` cuando el código no
  está vacío: hace imposible cargar dos veces la misma lista, que es justo el error que
  traía la carpeta de origen con FO-41.

### Verificación

Motor probado contra cinco escenarios, incluidos los casos límite que la fórmula única
deja expuestos:

1. Caso normal — general 80 %, por sujeto 66.7 % y 100 %, por dominio 100 % y 0 %.
2. **Todo NA** → `percent = null` ("sin dato"), **no 0 %**, y sin concepto de semáforo.
3. **Sin responder ≠ NA** → `pending = 5`, `complete = false`; lo no respondido no
   infla ni castiga el porcentaje.
4. Lista vacía y respuestas huérfanas (criterio borrado) → no rompe ni contamina.
5. Semáforo en los cortes exactos 90 / 80 / 70, y `0 %` real sí recibe concepto
   (distinto de "sin dato").

La interfaz se verificó con el flujo de Puppeteer de `CLAUDE.md` §6: hero de identidad,
editor de dominios y criterios, grilla de prueba con encabezado y primera columna
pegajosos, y el panel de resultado mostrando **"Sin dato" en gris** para el dominio con
todo NA junto a porcentajes semaforizados.

### Lo que la Fase 1 deliberadamente NO trae

Diligenciamiento real, directorio de sujetos, firmas, analítica e informes PDF. Las
tablas de esas fases (`checklist_audits`, `checklist_audit_subjects`,
`checklist_answers`, `checklist_signatures`) ya existen para no reformar el modelo
después, pero no tienen interfaz. La pestaña "Prueba de cálculo" del constructor es una
**simulación** que corre contra el motor real del servidor: sirve para validar la
estructura antes de publicar, no guarda nada.

---

## 11. Fase 2 — entregada

Entorno de diligenciamiento completo: un profesional asignado abre su lista, registra los
sujetos, califica criterio por criterio y cierra con la adherencia calculada.

### Archivos nuevos o tocados

| Archivo | Rol |
|---|---|
| `server/routes/checklists.mjs` | 15 endpoints nuevos: asignaciones, auditorías, sujetos, respuestas, cierre |
| `src/modules/checklists/pages/ChecklistAuditPage.tsx` | Pantalla de diligenciamiento (nueva) |
| `src/modules/checklists/pages/ChecklistsListPage.tsx` | Reestructurada: pestañas Auditorías / Listas |
| `src/modules/checklists/pages/ChecklistBuilderPage.tsx` | Pestaña «Asignación» |
| `src/modules/checklists/types.ts`, `services/checklistsService.ts` | Tipos y cliente de la fase |
| `src/index.css` | Grilla de calificación táctil, chips de sujeto, panel de asignación |
| `src/App.tsx` | Ruta `/app/listas-chequeo/auditorias/:auditId` |

### Flujo implementado

1. El equipo de calidad **asigna** la lista a profesionales (pestaña «Asignación» del
   constructor). Solo listas **publicadas** aparecen para diligenciar.
2. El auditor ve en «Nueva auditoría» únicamente **sus** listas asignadas e inicia la ronda
   con fecha.
3. Diligencia la **cabecera** (los campos que definió el constructor).
4. Agrega **sujetos**: nuevos, o traídos del **directorio reutilizable** — quien ya se
   registró en una ronda anterior se selecciona sin volver a teclearlo.
5. Califica en una grilla criterio × sujeto con botones **C / NC / NA**; el instructivo del
   criterio se muestra bajo el enunciado.
6. **Cierra** la auditoría: el resultado queda congelado con su porcentaje y concepto.

### Decisiones de implementación

- **Orden de rutas.** Las rutas estáticas (`/memberships`, `/audits/list`,
  `/subjects/directory`, `/assigned/mine`) se registran **antes** de `/:id`, o Express las
  captura como si el nombre fuera un id y la consulta revienta con un `NaN`.
- **Marcas en buffer local.** Tocar C/NC/NA no llama al servidor; se guarda al pulsar
  «Guardar». En una ronda con tablet y red inestable, una petición por toque es justo lo
  que no se quiere. El pendiente se recalcula en el cliente para que el avance se vea al
  instante.
- **Se envía también lo desmarcado** (`value: null`) para que el servidor borre esa fila.
  Sin eso, deshacer una marca no se persistiría nunca. Y se borra la fila en vez de
  guardar `NA`: sin responder y no aplica son estados distintos.
- **Solo se manda el diff** contra lo ya guardado, no la grilla entera.
- **El cierre valida `pending > 0`** y responde 409 con cuántas faltan. NA no bloquea,
  porque NA ya es una respuesta.
- **Una auditoría cerrada es un registro firmado**: `assertAudit({ requireOpen: true })`
  bloquea toda escritura (respuestas, sujetos, cabecera) hasta reabrirla.
- **Aislamiento por permiso**: quien no tiene `checklists.manage` ve solo sus propias
  auditorías y solo puede iniciar listas que le asignaron — validado en el servidor, no
  solo escondido en la interfaz.
- **Snapshot de atributos** al agregar el sujeto a la auditoría: si luego cambia de cama o
  cargo, la ronda vieja sigue mostrando lo que había ese día.

### Verificación

Interfaz verificada con el flujo de Puppeteer de `CLAUDE.md` §6: grilla con encabezado y
primera columna pegajosos, celdas **sin marcar resaltadas en ámbar**, botones de 42×38 px
para uso con el dedo, instructivo bajo el criterio, y el resultado cuadrando con el motor
(6 C sobre 8 aplicables = 75.0 %, con los 2 NA fuera del denominador).

### Pendiente de las fases siguientes

Firmas digitales (fase 3), analítica e informes PDF (fase 4) y la carga de las 13 listas
reales (fase 5). La tabla `checklist_signatures` ya existe pero aún no tiene interfaz.

---

## 12. Fase 3 — entregada

Firmas manuscritas en pantalla táctil, asociadas al registro con persona y fecha.

| Archivo | Rol |
|---|---|
| `src/modules/checklists/components/SignaturePad.tsx` | Lienzo de firma (nuevo) |
| `server/routes/checklists.mjs` | Alta/baja de firma, directorio de firmantes, invalidación al reabrir |
| `src/modules/checklists/pages/ChecklistAuditPage.tsx` | Tarjeta de firmas |
| `src/modules/checklists/types.ts`, `services/checklistsService.ts`, `src/index.css` | Tipos, cliente y estilos |

### Decisiones

- **Pointer Events, no touch/mouse por separado.** Una sola ruta de código cubre dedo,
  lápiz óptico y ratón. `setPointerCapture` evita que el trazo se corte si el dedo se sale
  del lienzo a mitad de la firma.
- **`touch-action: none` en el lienzo.** Sin eso, arrastrar el dedo para firmar hace
  *scroll* de la página en vez de trazar — en tablet el pad sería inservible.
- **Se dibuja a `devicePixelRatio` pero se exporta a tamaño lógico fijo** (600×180). Si se
  exportara el lienzo escalado, en una tablet retina cada firma pesaría el cuádruple sin
  verse mejor en el informe. Medido: ~8 KB por firma.
- **Tope de 400 KB por firma** en el servidor: el trazo llega desde un canvas del cliente y
  sin límite una firma manipulada podría inflar la fila sin control.
- **Un toque simple deja punto.** Sin la línea de 0.1 px en `pointerdown`, firmar con un
  punto no dibujaría nada.
- **Reabrir una auditoría INVALIDA sus firmas** (el servidor las borra en la misma
  transacción y devuelve cuántas). Una firma avala un contenido concreto; si se reabre para
  cambiar respuestas, conservarla dejaría firmas avalando algo que ya no es lo firmado. La
  interfaz avisa que habrá que volver a firmar.
- **Solo se firma con la auditoría abierta.** Cerrada es un registro firmado: no se agregan
  ni quitan firmas.
- **El directorio de firmantes se deriva del historial** (`DISTINCT ON` sobre las firmas de
  la entidad) en vez de mantener una tabla aparte: se mantiene solo, sin alta previa ni
  datos que se queden viejos. Quien firmó una vez queda disponible para las rondas
  siguientes.

### Verificación

Probado con interacción real de puntero en Puppeteer, no solo render estático: se traza una
firma sobre el lienzo, se comprueba que el componente emite la imagen (`HAS_IMAGE`), se
registra y aparece en la lista con nombre, rol y fecha. PNG resultante: 8.026 bytes.

---

## 13. Fase 4 — entregada

Analítica agregada e informes PDF (individual y consolidado).

| Archivo | Rol |
|---|---|
| `server/templates/checklistReport.mjs` | Plantillas HTML de ambos informes (nuevo) |
| `server/routes/checklists.mjs` | `/analytics/summary`, `/audits/:id/report.pdf`, `/analytics/consolidated.pdf` |
| `src/modules/checklists/components/AnalyticsPanel.tsx` | Pestaña de analítica (nuevo) |
| `src/modules/checklists/pages/ChecklistsListPage.tsx` | Tercera pestaña «Analítica» |
| `src/modules/checklists/pages/ChecklistAuditPage.tsx` | Botón «Informe PDF» |

### Decisiones

- **La agregación se hace en SQL sobre las respuestas, no promediando los porcentajes
  ya calculados de cada auditoría.** Promediar promedios le daría el mismo peso a una
  ronda de 1 sujeto que a una de 20. Se cuentan C y NC sobre el total real de criterios
  evaluados y NA queda fuera del denominador, igual que en el motor.
- **Solo entran auditorías CERRADAS.** Una en borrador está a medio diligenciar; contarla
  hundiría el indicador con criterios que aún nadie ha mirado.
- **«Sin dato» se propaga hasta el papel.** Un dominio o criterio con todo NA se imprime
  en gris como «Sin dato», nunca como 0 % en rojo — verificado en ambos informes.
- **Las barras del gráfico usan color semántico**, no el azul del módulo: el semáforo
  manda sobre la identidad cuando lo que se comunica es «qué tan bien va esto».
- **La descarga usa `fetch` + blob**, no navegación directa a la URL: así un error del
  servidor se muestra como mensaje en vez de dejar al usuario en una pestaña con un JSON
  crudo.
- **Plantillas y áreas se cargan para cualquiera con `.view`**, no solo para quien
  administra: los filtros de la analítica las necesitan.

### Verificación

Ambos PDF generados de verdad con el motor real (`renderPdf` sobre Puppeteer) y revisados
visualmente renderizando el mismo HTML del que salen:

- **Individual**: cabecera institucional con código y versión, datos generales, resultado
  77.8 % ámbar con concepto «Deficiente», desglose por dominio y por paciente, matriz
  criterio × sujeto con C/NC/NA en color, y las firmas. El criterio con todos los sujetos
  en NA aparece como **«Sin dato»**.
- **Consolidado**: 71.7 % con tallies, desglose por lista, por área y por dominio con
  barras semaforizadas, y ranking de criterios más incumplidos.
