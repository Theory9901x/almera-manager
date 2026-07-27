import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'sgimr.theme'

interface ThemeValue {
  theme: Theme
  toggle(): void
  /** true si el tema viene de la preferencia del sistema y no de una eleccion explicita. */
  fromSystem: boolean
}

const ThemeContext = createContext<ThemeValue | null>(null)

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch { return null }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Tema claro / oscuro.
 *
 * Arranca con la preferencia del SISTEMA y solo se queda fijo cuando la persona elige a mano:
 * quien tiene el equipo en oscuro no deberia tener que cambiarlo aqui tambien, y quien lo cambia
 * aqui no quiere que el sistema se lo vuelva a cambiar despues.
 *
 * El atributo va en <html> y no en <body> porque `color-scheme` tiene que llegar al documento
 * para que los controles nativos (barras de scroll, calendarios, autocompletado) cambien; en
 * <body> se aplicaria tarde y a medias.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Theme | null>(() => readStored())
  const [system, setSystem] = useState<Theme>(() => systemTheme())
  const theme = stored ?? system

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setStored(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* modo privado: se pierde al salir */ }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle, fromSystem: stored === null }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return value
}
