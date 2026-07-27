# Módulo "Listas de Chequeo" — Auditoría por Adherencia

Estado: **especificado, no implementado.** Este documento es el plan completo.
Leer primero `CLAUDE.md` (arquitectura, sistema de diseño y reglas de trabajo).

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
3. **FO-41 está duplicado** en la carpeta: confirmar cuál versión es la vigente.

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
| **1** | Modelo de datos, constructor de listas por área, motor de adherencia dinámico con exclusión de NA, semaforización. Sin firmas ni analítica. | Crear una lista de prueba con dominios y criterios, y que calcule adherencia correctamente. |
| **2** | Entorno de diligenciamiento: asignación, cabecera → sujetos → evaluación → guardado con cálculo. Directorio reutilizable de sujetos. | Un profesional asignado completa una auditoría de principio a fin y ve su adherencia semaforizada. |
| **3** | Firmas digitales en canvas (tablet), asociación al registro, directorio reutilizable de firmantes. | Firmar una auditoría desde pantalla táctil y ver la firma en el registro. |
| **4** | Analítica: tableros por dominio/criterio/servicio/evolución, informe PDF individual y consolidado. | PDF institucional generado y tablero con datos reales. |
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
