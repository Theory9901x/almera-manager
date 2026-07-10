# Fase 1 - Nucleo de plataforma SGIMR

Esta fase reemplaza la arquitectura de escritorio por una plataforma web multi-entidad.

## Alcance implementado

- Inicio de sesion con correo y contrasena.
- Contrasenas derivadas con `scrypt`, sesiones aleatorias almacenadas por hash y cookie `HttpOnly`.
- Separacion de datos por organizacion mediante membresias.
- Roles propios por entidad.
- Permisos administrativos asignables por rol.
- Catalogo central de modulos.
- Habilitacion de modulos por entidad y asignacion de modulos por rol.
- Panel administrativo para crear usuarios, activar/desactivar accesos y configurar roles.
- PostgreSQL como base central.
- Ejecucion en VPS con Node.js, PM2 y proxy web existente.

## Modelo de acceso

Un modulo aparece para un usuario solamente cuando se cumplen las tres condiciones:

1. El modulo esta activo en el catalogo de la plataforma.
2. La entidad tiene habilitado el modulo.
3. El rol del usuario tiene asignado el modulo.

Los permisos de API se validan en el servidor; ocultar un elemento de la interfaz no concede ni revoca acceso.

## Ejecucion local

1. Levantar PostgreSQL y crear una base `sgimr`.
2. Copiar `.env.example` a `.env` y ajustar las credenciales.
3. Exportar las variables del archivo o cargarlas en la terminal.
4. Ejecutar `npm install` y `npm run dev`.

En desarrollo, si no se define una contrasena inicial, se usa temporalmente `Admin1234!`.
En produccion la variable `BOOTSTRAP_ADMIN_PASSWORD` es obligatoria.

## Despliegue en VPS

1. Crear el registro DNS `A` de `sgimr.cloud` y `www` apuntando a la IPv4 del VPS.
2. Instalar Node.js 24, PostgreSQL, Git y PM2.
3. Crear `/opt/sgimr/shared/.env` con contrasenas unicas.
4. Publicar la app con el workflow de GitHub o copiar el paquete de release.
5. Configurar el proxy existente para enviar `sgimr.cloud` hacia `http://127.0.0.1:3100`.
6. Verificar `https://sgimr.cloud/api/health` y luego iniciar sesion.

## Proximas fases

Cada modulo se define antes de programarse: actores, flujo, estados, documentos,
indicadores, alertas, permisos y reportes. El orden recomendado es construir primero
el modulo que resuelva el proceso comercial mas urgente y usar sus patrones como base
para los siguientes.
