import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useAppStore }  from '@/store/appStore'
import type { Usuario } from '@/types'
import { Shield, Eye, EyeOff, ChevronRight, Lock, ArrowLeft } from 'lucide-react'

const AVATARS: Record<number, string> = {
  1: 'KR',
  2: 'JG',
  3: 'RG',
}

const COLORS: Record<number, { from: string; to: string; ring: string }> = {
  1: { from: '#6366f1', to: '#4f46e5', ring: '#6366f133' },
  2: { from: '#0ea5e9', to: '#0284c7', ring: '#0ea5e933' },
  3: { from: '#10b981', to: '#059669', ring: '#10b98133' },
}

export default function Login() {
  const { setUsuario } = useAuthStore()
  const { setAppMode } = useAppStore()
  const [usuarios,    setUsuarios]    = useState<Usuario[]>([])
  const [selected,   setSelected]    = useState<Usuario | null>(null)
  const [pin,        setPin]         = useState('')
  const [showPin,    setShowPin]     = useState(false)
  const [error,      setError]       = useState('')
  const [shaking,    setShaking]     = useState(false)
  const [loading,    setLoading]     = useState(false)

  useEffect(() => {
    window.api.auth.listarUsuarios().then(setUsuarios)
  }, [])

  function selectUser(u: Usuario) {
    setSelected(u)
    setPin('')
    setError('')
  }

  async function handleLogin() {
    if (!selected || pin.length < 4) return
    setLoading(true)
    setError('')
    const result = await window.api.auth.login({ id: selected.id, pin })
    setLoading(false)
    if (result) {
      setUsuario(result)
    } else {
      setError('PIN incorrecto. Intenta de nuevo.')
      setPin('')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
           style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }}/>
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
           style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}/>

      {/* Botón volver */}
      <button
        onClick={() => setAppMode(null)}
        className="absolute top-6 left-6 flex items-center gap-2 text-white/40 hover:text-white/80 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={16}/> Volver
      </button>

      {/* Header */}
      <div className="flex flex-col items-center mb-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-xl shadow-indigo-900/40 mb-4">
          <Shield size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Gestión de Calidad</h1>
        <p className="text-white/40 text-sm mt-1">Mejoramiento Institucional · Salud Yopal</p>
      </div>

      {/* User cards */}
      <div className="w-full max-w-2xl">
        <p className="text-white/30 text-xs font-semibold uppercase tracking-widest text-center mb-4">
          Selecciona tu perfil
        </p>
        <div className="grid grid-cols-3 gap-4">
          {usuarios.map(u => {
            const c = COLORS[u.id] ?? COLORS[1]
            const isActive = selected?.id === u.id
            return (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className={`relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 ${
                  isActive
                    ? 'border-white/30 bg-white/10 scale-[1.02]'
                    : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                }`}
                style={isActive ? { boxShadow: `0 0 0 4px ${c.ring}` } : {}}
              >
                {isActive && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                       style={{ background: c.from }}>
                    <ChevronRight size={11} className="text-white"/>
                  </div>
                )}
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg flex-shrink-0"
                     style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
                  {AVATARS[u.id] ?? u.nombre.slice(0,2).toUpperCase()}
                </div>
                <div className="text-center min-w-0">
                  <p className="text-white font-semibold text-sm leading-tight">{u.nombre}</p>
                  <p className="text-white/40 text-[11px] mt-0.5 leading-tight">{u.cargo}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* PIN input */}
        {selected && (
          <div className={`mt-6 bg-white/5 border border-white/10 rounded-2xl p-6 transition-all ${shaking ? 'animate-shake' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <Lock size={14} className="text-white/40"/>
              <p className="text-white/60 text-sm">
                Ingresa tu PIN — <span className="text-white font-medium">{selected.nombre}</span>
              </p>
            </div>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="• • • •"
                autoFocus
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-center text-2xl font-bold tracking-[0.5em] placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all"
              />
              <button
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPin ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-red-400 text-xs text-center font-medium">{error}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={pin.length < 4 || loading}
              className="mt-4 w-full py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 20px #6366f144' }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Verificando...</>
                : <>Ingresar <ChevronRight size={15}/></>
              }
            </button>
          </div>
        )}
      </div>

      <p className="mt-10 text-white/15 text-xs">GCI · v2.0 · Salud Yopal</p>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  )
}
