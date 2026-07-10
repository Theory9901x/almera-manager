# Arquitectura modular

## Principios

1. **Núcleo estable:** identidad, organizaciones, acceso, auditoría, archivos y notificaciones pertenecen a la plataforma.
2. **Módulos aislados:** cada gestión define sus propias tablas, servicios, rutas, permisos y componentes.
3. **Acceso del lado servidor:** todas las operaciones validan entidad, módulo y permiso; la navegación dinámica solo refleja ese resultado.
4. **Trazabilidad:** las operaciones sensibles deberán producir eventos de auditoría con autor, entidad, fecha y cambio.
5. **Configuración antes que bifurcación:** diferencias entre entidades se representan con parámetros y flujos configurables cuando sea razonable.

## Capas de autorización

```text
Usuario
  └─ Membresía en entidad
       └─ Rol
            ├─ Permisos de acción
            └─ Módulos visibles

Entidad
  └─ Módulos contratados/habilitados
```

El acceso efectivo a un módulo es la intersección entre el catálogo activo, la habilitación de la entidad y la asignación del rol.

## Ciclo de construcción de un módulo

Antes de escribir su lógica se documenta:

- objetivo y límites del proceso;
- actores y responsables;
- flujo normal y excepciones;
- estados y transiciones permitidas;
- datos, documentos y evidencias;
- permisos por acción;
- alertas, vencimientos y escalamiento;
- indicadores y reportes;
- integraciones requeridas;
- criterios de aceptación.

Después se implementa en entregas verticales: una gestión usable de extremo a extremo por entrega, con migración, API, interfaz, permisos y pruebas.

## Ruta sugerida

1. Núcleo de plataforma y control de acceso.
2. Auditoría transversal y almacenamiento de archivos.
3. Primer módulo comercial prioritario.
4. Notificaciones, vencimientos e indicadores del primer módulo.
5. Segundo módulo y relaciones entre módulos.
6. Configuración avanzada por entidad y empaquetado comercial.
