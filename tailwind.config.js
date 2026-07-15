/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        almera: {
          50:  '#f0f4ff',
          100: '#dbe4ff',
          500: '#4c6ef5',
          600: '#3b5bdb',
          700: '#2f4ac2',
          900: '#1a2c8a'
        },
        // Escala de semaforo de cumplimiento (fija, no editable) — Matrices de Adherencia.
        // Los 7 gradientes por ambito son dinamicos (asignados por posicion, no por nombre fijo)
        // y viven en src/modules/adherence/design/scopeColors.ts, aplicados via estilos inline.
        concept: {
          optimo: '#059669',
          aceptable: '#65A30D',
          deficiente: '#D97706',
          muydeficiente: '#DC2626',
          sindatos: '#94A3B8',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
