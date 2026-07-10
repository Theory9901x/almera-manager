# SGIMR

Sistema de Gestion Integral Modular para centralizar procesos de una entidad con
acceso por organizacion, usuario, rol, permiso y modulo.

## Arquitectura

- React + TypeScript + Vite para la experiencia web.
- Node.js + Express para la API.
- PostgreSQL para datos transaccionales y control de acceso.
- Sesiones seguras mediante cookie `HttpOnly`; en la base solo se almacena el hash del token.
- PM2 para ejecutar la aplicacion en el VPS.
- Proxy web existente del VPS para publicar `sgimr.cloud` con HTTPS.

## Fase actual

La fase 1 implementa el nucleo de identidad y modularidad:

- login;
- organizaciones;
- usuarios y membresias;
- roles y permisos;
- catalogo de modulos;
- modulos habilitados por entidad;
- modulos asignados por rol;
- administracion desde la interfaz web.

Consulta [docs/FASE-1-NUCLEO.md](docs/FASE-1-NUCLEO.md) para el alcance y el
despliegue.

## Desarrollo

Requiere Node.js 24 LTS y PostgreSQL 16+.

```bash
npm install
npm run dev
```

Variables minimas:

```env
DATABASE_URL=postgresql://sgimr:sgimr_dev@127.0.0.1:5432/sgimr
PUBLIC_ORIGIN=http://localhost:3000
```

La API aplica el esquema y crea la organizacion inicial al arrancar. En desarrollo,
la cuenta inicial predeterminada es `admin@sgimr.cloud` con contrasena temporal
`Admin1234!`; debe cambiarse antes de usar datos reales.

## Verificacion

```bash
npm run check
npm run build
```

## Produccion

SGIMR se despliega en el VPS como aplicacion Node.js administrada por PM2, escuchando
en `127.0.0.1:3100`. El proxy existente del VPS debe enrutar `sgimr.cloud` hacia ese
puerto interno.

El flujo automatizado de GitHub esta descrito en
[docs/DESPLIEGUE-GITHUB.md](docs/DESPLIEGUE-GITHUB.md).
