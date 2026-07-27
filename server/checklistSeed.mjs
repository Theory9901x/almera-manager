// Listas institucionales de seguridad del paciente (ESE Salud Yopal), extraidas del contenido de
// los formatos .xlsx originales — no transcritas a mano.
//
// Son DATOS, no codigo: el constructor generico las arma solo con esta configuracion. Los
// formatos en papel tienen tres maquetados distintos (criterios en columnas, criterios en filas,
// y listas con dos secciones de indagacion), y aun asi los trece caben en el mismo modelo
// lista -> dominios -> criterios. Ver docs/MODULO-LISTAS-DE-CHEQUEO.md, fase 5.
//
// Los textos se conservan tal como vienen del formato, incluidas sus faltas de tilde y erratas:
// es un documento institucional con codigo y version, y corregirlo por cuenta propia lo
// desalinearia del papel que firma el auditor. Solo se normalizo la MAYUSCULA SOSTENIDA de los
// encabezados, que en una grilla densa cuesta leer.
//
// La escala no se declara: es fija C / NC / NA en todo el modulo.

export const CHECKLIST_SEEDS = [
  {
    // Formato impreso: criterios en columnas y pacientes en filas.
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
    // Numeracion del original: salta el 12 (va 11 -> 13). Se respeta tal cual.
    code: "GCM-SPA-FO-26",
    version: "01",
    name: "Ronda de seguridad — Farmacovigilancia",
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
  {
    code: "GCM-SPA-FO-28",
    version: "01",
    name: "Administración segura de medicamentos",
    subjectLabel: "Colaborador",
    numberedItems: false,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Dispensacion",
        criteria: [
          { text: "PACIENTE CORRECTO: Verifique que los medicamentos se entregaron al paciente correcto, confrontando el nombre del paciente en la formula o solicitud." },
          { text: "MEDICAMENTO CORRECTO: Verificar y controlar que los medicamentos (Principio Activo) dispensados, correspondan a los prescritos." },
          { text: "DOSIS CORRECTA: Verificar la entrega de la cantidad total de unidades farmacéuticas prescritas, requeridas para el tratamiento" },
          { text: "FORMA FARMACÉUTICA CORRECTA: Confrontar con la formula médica y los medicamentos en físico, que la forma farmacéutica corresponda a las prescritas." },
        ],
      },
      {
        name: "Normas de bioseguridad",
        criteria: [
          { text: "El personal que administra medicamentos tiene los EPP (Gorro, bata, tapabocas, guantes)." },
          { text: "El personal mantiene las uñas cortas, sin o con esmalte integro, sin extensiones, ni accesorios en las manos." },
          { text: "Realiza una técnica adecuada de higiene de manos." },
        ],
      },
      {
        name: "Administracion de medicamentos",
        criteria: [
          { text: "Identifica al paciente según protocolo antes de administrar algún medicamento. (Confrontando manilla y tablero de identificación, con el Kárdex de medicamentos.)" },
          { text: "El personal que administra medicamentos conoce los conceptos de medicamentos LASA y de alto riesgo" },
          { text: "Los medicamentos se encuentran Semaforizados de acuerdo al riesgo" },
          { text: "El personal de salud reconoce los correctos de la administraciòn de medicamentos adoptados por la instituciòn" },
          { text: "Utiliza un par de guantes por paciente para la preparación y administración de medicamentos" },
          { text: "Si el paciente tiene mas de 5 medicamentos se le identifica la POLIMEDICACIÒN" },
          { text: "Los medicamentos que se administran por vía oral son administrados por el personal de enfermería, verifica que el paciente consuma el medicamento." },
          { text: "Desecha adecuadamente los residuos hospitalarios (agujas, bolsas, torundas, frascos, etc)" },
        ],
      },
    ],
  },
  {
    code: "GCM-SPA-FO-29",
    version: "01",
    name: "Reducir el riesgo — atención a pacientes con enfermedad mental",
    subjectLabel: "Colaborador",
    numberedItems: false,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Riesgo de fuga",
        criteria: [
          { text: "conoce como se identifica a un paciente con riesgo de fuga" },
          { text: "Antes de cada procedimiento y durante el contacto que se tenga con el paciente y su acudiente el Profesional la salud verifica y compara la información (nombre y documento de identidad)" },
          { text: "el personal de salud identifica el riesgo de fuga de los pacientes (tablero/manilla/kardex)" },
          { text: "Durante el proceso de atención se sensibilizará al paciente y su acudiente sobre el riesgo de pérdida de pacientes en la institución" },
          { text: "El guarda de seguridad solicita y verifica formato de la boleta de salida al egreso del paciente" },
          { text: "Cuando se presente la fuga de paciente se realiza nota de enfermería" },
          { text: "Personal de enfermería de turno realiza reporte de atención insegura al programa de seguridad del paciente para su análisis y clasificación" },
        ],
      },
    ],
  },
  {
    code: "GCM-SPA-FO-30",
    version: "01",
    name: "Prevención de malnutrición y nutrición",
    subjectLabel: "Colaborador",
    numberedItems: false,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Prevención de malnutrición",
        criteria: [
          { text: "La institucion cuenta con una politica que valore la nutrición del paciente como parte integral del cuidado en especial la población pediátrica, gestante y con comorbilidades." },
          { text: "Se Realiza medición antropométrica a los pacientes con riesgo de malnutricion que ingresen a la institución para atención ambulatoria y hospitalaria para identificar el riesgo nutricional" },
          { text: "la institucion realiza actividades de promocion y prevencion de la malnutricion" },
          { text: "la institucion implementa la rutas de atencion para pacientes con malnutricion" },
          { text: "la institucion promueve actividades de autocuidado como la lactacia materna exclusiva hasta lo seis meses y complementaria hasta los dos años" },
          { text: "se realizan actividades en pro del higiene de manos como estrategia para mitigar el riesgo de malnutrcion" },
          { text: "la institucion realiza estrategia para mejorar la calidad de la dieta familiar y el consumo de alimentos" },
        ],
      },
    ],
  },
  {
    code: "GCM-SPA-FO-32",
    version: "01",
    name: "Prácticas seguras en la obtención de ayudas diagnósticas",
    subjectLabel: "Colaborador",
    numberedItems: false,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Prácticas seguras",
        criteria: [
          { text: "Se realizar identificación al paciente acorde al manual de seguridad de identificación." },
          { text: "El paciente cuenta con la preparacion Adecuada para el examen a realizar" },
          { text: "La ayuda diagnostica es pertienente de acuerdo al diagnostico del paciente" },
          { text: "Se evidencia Diligenciamiento de consentimiento informado" },
          { text: "Se realiza explicación de riesgos y posibles complicaciones del procedimiento a realizar." },
          { text: "EL profesional tiene en cuenta las normas de bioseguridad durante el procedimiento" },
          { text: "El médico tratante tiene conocimiento claro de los estudios por modalidad, indicaciones, contraindicaciones" },
          { text: "El personal de salud tiene Conocimiento del \"MANUAL DE PRACTICA SEGURA MEJORAR LA SEGURIDAD EN LA OBTENCION DE AYUDAS DIAGNOSTICAS\"" },
          { text: "El personal de salud sabe donde reportar los sucesos o eventos relacionados con el diagnostico que se llegaran a presentar en la institucion" },
        ],
      },
    ],
  },
  {
    code: "GCM-SPA-FO-33",
    version: "01",
    name: "Uso adecuado de herramientas de reporte",
    subjectLabel: "Colaborador",
    numberedItems: false,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Reporte de sucesos inseguros",
        criteria: [
          { text: "El personal de salud tiene claro el concepto de evento adverso" },
          { text: "El personal de salud conoce el termino de incidente" },
          { text: "se identifica los mecanismo de reporte de sucesos inseguros institucionales" },
          { text: "El personal de salud identifica los mecanismos de reporte de sucesos de seguridad institucioanales" },
          { text: "El personal entrevista a reportado un suceso de seguridad en el ultimo mes" },
          { text: "El personal de salud conoce el termino de cultura no punitiva" },
        ],
      },
    ],
  },
  {
    // Dos secciones: se indaga al personal y luego al paciente y familiar.
    code: "GCM-SPA-FO-35",
    version: "01",
    name: "Consentimiento informado",
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
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Indague al personal de turno o funcionarios",
        criteria: [
          { text: "Conoce el protocolo de consentimiento informado?", item_number: "1" },
          { text: "Sabe dónde consultarlo en caso de necesitarlo?", item_number: "2" },
          { text: "Tiene presente cuáles procedimientos o tratamientos requieren consentimiento informado?", item_number: "3" },
          { text: "El documento contiene registro médico o firma del médico que informa ?", item_number: "4" },
          { text: "Se evidencia registro en el formato institucional de consentimiento informado todos los ítems?", item_number: "5" },
          { text: "El consentimiento o documento tiene fecha de su realización o diligenciamiento ?", item_number: "6" },
        ],
      },
      {
        name: "Indague al paciente y familiar",
        criteria: [
          { text: "La persona que diligencio el consentimiento le explico de forma comprensible el procedimiento y el motivo del consentimiento ?", item_number: "7" },
          { text: "Se le explica al paciente los beneficios que se esperan del procedimiento ?", item_number: "8" },
          { text: "Se le brindo informacion sobre los posibles riesgos del procedimiento,complicaciones o secuelas ?", item_number: "9" },
          { text: "El paciente o el representante legal (tutor/cuidador) conocen sabe que puede cambiar de opinión frente al consentimiento otorgado o rechazado (revocabilidad)?", item_number: "10" },
          { text: "El documento contiene la firma del paciente, en los casos que aplique del tutor o cuidador?", item_number: "11" },
        ],
      },
    ],
  },
  {
    // Formato impreso: criterios en columnas y colaboradores en filas.
    code: "GCM-SPA-FO-36",
    version: "01",
    name: "Adherencia a la política de seguridad del paciente",
    subjectLabel: "Colaborador",
    numberedItems: false,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Cargo", field_type: "TEXT" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Conocimiento de la política de seguridad",
        criteria: [
          { text: "Conoce el objetivo de la politica de Seguridad del paciente" },
          { text: "Conoce el nombre del programa de seguridad del paciente de la ESE salud yopal" },
          { text: "Identifica el numero de practicas seguras que implementa la ESE Salud yopal" },
          { text: "Reconoce los mecanismos de de reporte de sucesos inseguros" },
          { text: "conoce el concepto de evento adverso e incidente" },
        ],
      },
    ],
  },
  {
    // Dos secciones: se indaga al personal y luego al paciente y familiar.
    code: "GCM-SPA-FO-39",
    version: "01",
    name: "Prevención de caídas",
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
      { label: "Cargo o rol", field_type: "TEXT" },
      { label: "N.º de cama", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Indague al personal de turno o funcionarios",
        criteria: [
          { text: "Sabe dónde consultar el protocolo institucional de prevención de caídas?", item_number: "1" },
          { text: "El personal de turno,conoce con que escala se evalua el riesgo de caidas en la institución?", item_number: "2" },
          { text: "Según el manual de identificación paciente,como se identifica al paciente con riesgo caidas ?", item_number: "3" },
          { text: "Conoce los factores extrinsecos( Externo) para la presencia de una caida ?", item_number: "4" },
          { text: "Conoce los factores intrinsecos ( Interno) para la presencia de una caida ?", item_number: "5" },
          { text: "Se evidencia la escala de valoracion de caida dilegenciada en el sistema?", item_number: "6" },
        ],
      },
      {
        name: "Indague al paciente y familiar",
        criteria: [
          { text: "El paciente se le ha explicado respecto a las manillas de identifcación que porta,", item_number: "7" },
          { text: "Si el paciente presenta riesgo de caidas tiene manilla que identifica el riesgo", item_number: "8" },
          { text: "El riesgo de caidas se encuentra identificado en el tablero de identificación", item_number: "9" },
          { text: "Al indagar a los pacientes (urgencias, hospitalizaciòn) manifiestan supervision y/o acompañamiento por enfermeria y cuidadores cuando requieran uso del baño y movilidad.", item_number: "10" },
          { text: "Se oriento a los familiares y pacientes sobre los factores de riesgo a los que esta expuesto.", item_number: "11" },
        ],
      },
    ],
  },
  {
    // La numeracion del original reinicia en 7 en la segunda seccion; se respeta.
    code: "GCM-SPA-FO-40",
    version: "01",
    name: "Identificación del paciente",
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
      { label: "Cargo o rol", field_type: "TEXT" },
      { label: "N.º de cama", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Indague al personal de turno o funcionarios",
        criteria: [
          { text: "¿Conoce el protocolo institucional de identificacion de pacientes?", item_number: "1" },
          { text: "Sabe donde consultarlo en caso de necesitarlo?", item_number: "2" },
          { text: "El colaborador conoce el código de colores de los brazaletes según protocolo", item_number: "3" },
          { text: "El colaborador sabe identificar al paciente que ingresa como NN", item_number: "4" },
          { text: "El personal de salud tiene conocimiento de la verificación cruzada", item_number: "5" },
          { text: "El colaborador sabe como identificar a los niños y niñas que se encuentren en alojamiento conjunto pero no se encuentran hospitalizados, (la madre es la que esta hospitalizada)", item_number: "6" },
          { text: "El personal tiene conocimiento de como reportar sucesos inseguros relacioando con la identificación del paciente", item_number: "7" },
        ],
      },
      {
        name: "Indague al paciente y familiar",
        criteria: [
          { text: "La manilla de identificación contiene datos verificadores establecidos según protocolo.", item_number: "7" },
          { text: "El tablero de los pacientes esta diligenciado según protocolo. (el documento de identidad coincide con la manilla de identificación).", item_number: "8" },
          { text: "Se le explica al paciente y/o familia el objetivo del brazalete y que significa el color asignado?", item_number: "9" },
          { text: "El Paciente tiene la manilla de identificación en el lugar definido según protocolo", item_number: "10" },
        ],
      },
    ],
  },
  {
    // En la carpeta de origen venia duplicado; es la misma lista y se carga una sola vez.
    code: "GCM-SPA-FO-41",
    version: "01",
    name: "Comunicación efectiva",
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
      { label: "Cargo o rol", field_type: "TEXT" },
      { label: "N.º de cama", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Indague al personal de turno o funcionarios",
        criteria: [
          { text: "Conoce el manual de comunicación efectiva?", item_number: "1" },
          { text: "Sabe dónde consultarlo en caso de necesitarlo?", item_number: "2" },
          { text: "El personal de salud comprende la comunicación efectiva y asertiva ?", item_number: "3" },
          { text: "El personal de saud Implementa y aplica en su desempeño buenas prácticas institucionales y asistenciales, e involucran al usuario y su familia", item_number: "4" },
          { text: "Se evidencia una comunicación efectiva y asertiva en actividades como la entrega y recibo de turno o asignaciones de órdenes", item_number: "5" },
          { text: "Observe si el personal recibe y saluda amablemente y nombra al paciente por su nombre (Corrobora datos con familiar en caso de inconciencia.)", item_number: "6" },
        ],
      },
      {
        name: "Indague al paciente y familiar",
        criteria: [
          { text: "Se presentó el personal antes de iniciar la atención del paciente y porta la identificación correspondiente", item_number: "7" },
          { text: "El personal recibe y saluda amablemente y nombra al paciente por su nombre (Corrobora datos con familiar en caso de inconciencia.)", item_number: "8" },
          { text: "El personal de salud brinda educación continua al paciente y sus cuidadores. ( Evolucion medica, medicamentos administrar, resultado medicos )", item_number: "9" },
          { text: "El personal de salud que los visita a diaria se presenta con su nombre y atiende sus preguntas respecto a la atención", item_number: "10" },
        ],
      },
    ],
  },
  {
    code: "GCM-SPA-FO-46",
    version: "01",
    name: "Procedimiento quirúrgico seguro",
    subjectLabel: "Colaborador",
    numberedItems: true,
    headerFields: [
      { label: "Centro de atención", field_type: "TEXT" },
      { label: "Servicio", field_type: "TEXT" },
      { label: "Evaluador", field_type: "TEXT" },
      { label: "Fecha", field_type: "DATE" },
    ],
    subjectFields: [
      { label: "Cargo o rol", field_type: "TEXT" },
    ],
    domains: [
      {
        name: "Procedimiento quirúrgico seguro",
        criteria: [
          { text: "Se encuentra diligenciada en la Historia Clinica: Plan de tratamiento, cuenta con ayudas diagnosticas y el analisis de las mismas.", item_number: "1" },
          { text: "Se realizo verificacion de los cinco correctos de odontologia", item_number: "2" },
          { text: "Le suministro indicaciones pre operatorias al paciente.", item_number: "3" },
          { text: "Indagó el manejo farmacológico actual del paciente", item_number: "4" },
          { text: "Confirmó sitio quirurgico y procedimiento a realizar", item_number: "5" },
          { text: "Realizó toma de signos vitales del paciente.", item_number: "6" },
          { text: "Brindó información sobre el consentimiento informado y se cercioró que el usuario, acompañante, familiar o cuidador haya entendido claramente el procedimiento a realizar.", item_number: "7" },
          { text: "Cuenta con el equipo biomedico adecuado y pertienente para el procedimiento.", item_number: "8" },
          { text: "Cuenta con los insumos necesarios para la intervención y para el manejo de complicaciones (Si se requiere)", item_number: "9" },
          { text: "Formuló terapia farmacologica según la necesidad del usuario", item_number: "10" },
          { text: "El personal tiene en cuenta los cinco momentos de higiene de manos", item_number: "11" },
          { text: "Suministró indicaciones post - exodoncia (incluyendo signos de complicaciones)", item_number: "12" },
        ],
      },
    ],
  },
]
