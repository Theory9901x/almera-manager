// Listas institucionales reales de seguridad del paciente (ESE Salud Yopal), extraidas del
// contenido de los formatos .xlsx originales — no transcritas a mano.
//
// Son DATOS, no codigo: el constructor generico las arma solo con esta configuracion. Si una
// lista nueva necesitara codigo nuevo, el constructor estaria mal hecho (ver
// docs/MODULO-LISTAS-DE-CHEQUEO.md, fase 5).
//
// La escala no se declara: es fija C / NC / NA en todo el modulo.

export const CHECKLIST_SEEDS = [
  {
    // Formato impreso: criterios en columnas y pacientes en filas. Sin numerar.
    code: "GCM-SPA-FO-24",
    version: "01",
    name: "Ronda diaria de seguridad del paciente",
    subjectLabel: "Paciente",
    numberedItems: false,
    headerFields: [
      { label: "Fecha", field_type: "DATE" },
      { label: "Responsable", field_type: "TEXT" },
      { label: "Personal de turno", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cama", field_type: "TEXT" },
      { label: "Servicio o área", field_type: "TEXT" },
      { label: "Documento de identidad", field_type: "TEXT" },
      { label: "Clasificación del riesgo", field_type: "SELECT", options: ["IDENT", "RIES", "ALER"] },
    ],
    domains: [
      {
        name: "Identificar correctamente al paciente",
        criteria: [
          { text: "Paciente con manilla de identificacion datos correctos y legibles" },
          { text: "Tablero unidad correcta-mente diligenciados" },
          { text: "Los riesgos se encuentran diligenciados en el kardex de enfermeria" },
        ],
      },
      {
        name: "Reducir el riesgo de daño al paciente por causa de caida",
        criteria: [
          { text: "Barandas elevadas en paciente con alto riesgo de caida" },
          { text: "La cama esta en posicion y con el freno puesto" },
          { text: "La escala de valoracion se encuentra diligenciada" },
        ],
      },
      {
        name: "Atencion a la usuaria gestante y el bebe recien nacido",
        criteria: [
          { text: "El recien nacido porta la manilla de identificacion" },
          { text: "La materna cuenta con acompañemiento para el proceso del parto" },
        ],
      },
      {
        name: "Consentimientos informado",
        criteria: [
          { text: "Consentimientos informado diligenciado correctamente" },
        ],
      },
      {
        name: "Seguridad en medicamento",
        criteria: [
          { text: "Los equipos y medicamentos se encuentran diligenciados" },
          { text: "La fijacion del cateter esta la rotulada correctamente" },
          { text: "Se observan equipos de venoclisis tapones y venas limpias." },
        ],
      },
      {
        name: "El paciente y su autocuidado",
        criteria: [
          { text: "El personal de salu d a realizado educacion en un tema determinaod" },
          { text: "Se ha informado al paciente sobre las precauciones que debe tener" },
        ],
      },
      {
        name: "Reducir el riesgo de infecciones",
        criteria: [
          { text: "El personal se higieniza la manos al estar en contacto con el paciente" },
          { text: "Se evidencia signos de infeccion en accesos o herida qx" },
          { text: "Identificación de habitaciones de aislamiento y dotacion de epp" },
        ],
      },
    ],
  },
  {
    // Numeracion del formato original: salta el 12 (va 11 -> 13). Se respeta tal cual, por eso el numero es texto libre.
    code: "GCM-SPA-FO-26",
    version: "01",
    name: "Lista de chequeo ronda de seguridad — Farmacovigilancia",
    subjectLabel: "Colaborador",
    numberedItems: true,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Servicio", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Uso seguro de medicamentos",
        criteria: [
          { text: "Los medicamentos proximos a vencer, \"LASA\" y de aslto riesgo se encuentran semaforizados correctamente?", item_number: "1" },
          { text: "Se realizan las consultas de las alertas emitidas por el invima. Y, se realiza la consulta de la vigencia de los registros sanitarios de los insumos que ingresan al servicio conservando su evidencia.", item_number: "2" },
          { text: "Los dispositivos médicos almacenados en el lugar, ¿se encuentran clasificados según su riesgo de acuerdo a la clasificación emitida por el INVIMA?", item_number: "3" },
          { text: "El personal del servicio auditado conoce Qué, cuándo, cómo y por qué reportar reacciones adversas relacionadas con medicamentos?.", item_number: "4" },
        ],
      },
      {
        name: "Inventario. aseo, orden, limpieza y desinfeccion",
        criteria: [
          { text: "El kardex institucional se encuentra actualizado y coincide con la información de los productos en físico.", item_number: "5" },
          { text: "Se evidencian insumos acumulados en exceso y/o sobrantes, sin justificación en el servicio?", item_number: "6" },
          { text: "Las condiciones generales de limpieza y desinfección para el almacenamiento y conservación de medicamentos y dispositivos médicos, es la que exigen los laboratorios productores?", item_number: "7" },
          { text: "Se evidencian condiciones normales de limpieza en los pisos y demas superficies del lugar, sin presencia de derrames, residuos peligrosos, u otros.", item_number: "8" },
          { text: "Las superfcies de los espacios de almacenamiento de medicamentos y dispositivos médicos no presentan polvo y residuos comunes u ordinarios", item_number: "9" },
        ],
      },
      {
        name: "Almacenamiento y conservación",
        criteria: [
          { text: "El almacenamiento de medicamentos de medicamentos y dispositivos médicos contenidos en el servicio, son adecuados?", item_number: "10" },
          { text: "Los dispositivos médicos se encuentran almacenados en orden y clasificados según su riego?", item_number: "11" },
          { text: "¿Las condiciones físicas y de factores ambientales en el servicio, son los ideales para el manejo transitorio de medicamentos e insumos médicos?", item_number: "13" },
          { text: "Las soluciones de reenvase se encuentran rotuladas de acuerdo al procedimiento actual.", item_number: "14" },
          { text: "los carros de paro se encuentran con sellos de seguridad y sus respectivas actas de apertura?", item_number: "15" },
          { text: "Se evidencian condiciones normales de limpieza en los carros de medicamentos", item_number: "16" },
          { text: "En los listados de los carros de paro, sus insumos se encuentran debidamente registrados", item_number: "17" },
        ],
      },
    ],
  },
]
