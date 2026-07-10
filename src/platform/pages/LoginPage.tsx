import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, HeartPulse, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, Button } from '@/shared/ui'

export default function LoginPage() {
  const { login, ready } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try { await login(email, password) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesion') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#070B10] text-white lg:grid lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden min-h-screen flex-col justify-between p-12 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(179,38,58,.32),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(86,214,201,.16),transparent_30%),linear-gradient(135deg,#070B10_0%,#0B1117_48%,#101820_100%)]" />
        <div className="absolute inset-x-10 bottom-28 h-56 rounded-[3rem] bg-[#8B1E2D]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#8B1E2D] text-white shadow-2xl shadow-black/50"><HeartPulse /></div>
          <div>
            <p className="text-sm font-black uppercase tracking-[.25em]">ALMERA Manager</p>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">ESE Salud Yopal</p>
          </div>
        </div>
        <div className="relative max-w-3xl">
          <Badge tone="accent">Gestion ALMERA</Badge>
          <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-tight xl:text-6xl">
            Control institucional, usuarios y trazabilidad en una sola consola.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Base administrativa para gestionar roles, permisos, entidad activa y el ciclo operativo de solicitudes documentales ALMERA.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {[
            ['Usuarios', 'roles y accesos'],
            ['ALMERA', 'solicitudes y evidencias'],
            ['Informes', 'seguimiento basico'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/[.05] p-4 backdrop-blur">
              <p className="text-sm font-black">{title}</p>
              <p className="mt-1 text-xs text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center bg-[#0B1117] px-6 py-12 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(86,214,201,.10),transparent_34%),linear-gradient(180deg,#0B1117_0%,#070B10_100%)]" />
        <div className="relative w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#8B1E2D] text-white"><HeartPulse /></div>
            <p className="text-sm font-black uppercase tracking-[.22em]">ALMERA Manager</p>
          </div>
          <div className="ui-card p-7">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Acceso seguro</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">Entrar al sistema</h2>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#56D6C9]/10 text-[#56D6C9]"><ShieldCheck /></div>
            </div>
            <form onSubmit={submit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-slate-400">Correo electronico</span>
                <span className="relative block">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input h-12 pl-12 pr-4" placeholder="usuario@sgimr.cloud" />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-slate-400">Contrasena</span>
                <span className="relative block">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input autoComplete="current-password" type={show ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className="input h-12 pl-12 pr-12" placeholder="Tu clave de acceso" />
                  <button type="button" aria-label="Mostrar contrasena" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-[#56D6C9]">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </span>
              </label>
              {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm font-medium text-red-200">{error}</div>}
              <Button disabled={!ready || loading} className="group h-12 w-full">
                {loading ? 'Verificando...' : <>Ingresar <ArrowRight className="transition group-hover:translate-x-1" size={17} /></>}
              </Button>
            </form>
          </div>
          <p className="mt-5 text-center text-xs text-slate-500">ALMERA Manager · sgimr.cloud</p>
        </div>
      </section>
    </div>
  )
}
