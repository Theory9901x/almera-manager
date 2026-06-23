# Almera Manager

App de escritorio para la gestión profesional de la plataforma Almera.
Construida con **Electron + React + TypeScript + SQLite**.

---

## Requisitos previos

- Node.js 18 o superior
- npm 9+
- Windows 10+ / macOS 12+ / Ubuntu 20+

---

## Instalación y arranque

```bash
# 1. Instalar dependencias
npm install

# 2. Arrancar en modo desarrollo
npm run dev
```

La app abre automáticamente en una ventana de escritorio.

---

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Modo desarrollo con hot reload |
| `npm run build` | Compilar para producción |
| `npm run package` | Generar instalador (.exe / .dmg) |

---

## Estructura del proyecto

```
almera-manager/
├── electron/           # Proceso principal Electron
│   ├── main.ts         # Ventana, ciclo de vida, registro IPC
│   ├── preload.ts      # Bridge seguro React ↔ Electron
│   └── ipc/            # Handlers por módulo
│       ├── periodos.ts
│       ├── gestion.ts
│       ├── evidencias.ts
│       ├── tareas.ts
│       ├── actividades.ts
│       ├── notificaciones.ts
│       └── informes.ts
│
├── src/                # Interfaz React
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── modules/        # Una carpeta por pantalla
│   │   ├── dashboard/
│   │   ├── gestion/
│   │   ├── evidencias/
│   │   ├── tareas/
│   │   ├── informes/
│   │   └── notificaciones/
│   ├── components/     # Sidebar, Header, Badge, MonthPicker
│   ├── store/          # Estado global Zustand
│   └── types/          # Tipos TypeScript + declaración window.api
│
├── db/
│   ├── schema.sql      # Definición de tablas SQLite
│   └── database.ts     # Conexión better-sqlite3
│
└── public/             # Iconos y assets estáticos
```

---

## Dónde se guarda la base de datos

El archivo `almera.db` se guarda en la carpeta de datos del sistema:

- **Windows:** `%APPDATA%\almera-manager\almera.db`
- **macOS:** `~/Library/Application Support/almera-manager/almera.db`
- **Linux:** `~/.config/almera-manager/almera.db`

Las evidencias (archivos copiados) se guardan en:
`<userData>/evidencias/`

---

## Módulos implementados

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | Métricas del período activo |
| **Gestión** | Indicadores + planes de mejora |
| **Evidencias** | Carga de archivos con drag & drop |
| **Tareas** | Tablero Kanban con alertas de vencimiento |
| **Informes** | Exportación PDF y Excel |
| **Notificaciones** | Historial de alertas del sistema |

---

## Generar instalador

```bash
# Windows (.exe instalador)
npm run package:win

# El instalador queda en /release
```
