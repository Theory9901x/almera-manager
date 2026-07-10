import { useState } from 'react'
import {
  ArrowRight, Check, Eye, EyeOff, Fingerprint, Layers3,
  LockKeyhole, Mail, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { BrandMark, Button } from '@/shared/ui'

const capabilities = [
  ['Gestión centralizada', 'Usuarios, roles y módulos en un solo espacio.'],
  ['Trazabilidad ALMERA', 'Solicitudes, evidencias y estados siempre visibles.'],
  ['Acceso institucional', 'Permisos y sesiones protegidas por rol.'],
]

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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesión') }
    finally { setLoading(false) }
  }

  return (
    <main className="login-screen">
      <section className="login-access">
        <div className="login-mobile-brand">
          <BrandMark compact />
          <div><strong>SGIMR</strong><span>Gestión integral modular</span></div>
        </div>

        <div className="access-card">
          <div className="access-card-head">
            <div>
              <p className="eyebrow">Bienvenido de nuevo</p>
              <h1>Accede a tu espacio</h1>
              <p>Gestiona la operación institucional desde una plataforma segura y unificada.</p>
            </div>
            <div className="access-shield"><ShieldCheck /></div>
          </div>

          <form onSubmit={submit} className="access-form">
            <label>
              <span>Correo institucional</span>
              <div className="login-input">
                <Mail size={18} />
                <input autoComplete="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@entidad.gov.co" />
              </div>
            </label>

            <label>
              <span>Contraseña</span>
              <div className="login-input">
                <LockKeyhole size={18} />
                <input autoComplete="current-password" type={show ? 'text' : 'password'} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Ingresa tu contraseña" />
                <button type="button" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="login-options">
              <label className="remember-option"><input type="checkbox" /> <span>Recordar acceso</span></label>
              <button type="button">¿Olvidaste tu contraseña?</button>
            </div>

            {error && <div className="access-error">{error}</div>}

            <Button disabled={!ready || loading} className="access-submit">
              {loading ? 'Verificando credenciales...' : <>Ingresar a SGIMR <ArrowRight size={17} /></>}
            </Button>
          </form>

          <div className="access-foot">
            <span><Fingerprint size={15} /> Sesión protegida</span>
            <span><Check size={15} /> Acceso por roles</span>
          </div>
        </div>

        <p className="login-copyright">© 2026 SGIMR · Plataforma institucional</p>
      </section>

      <section className="login-intel">
        <div className="login-glow login-glow-one" />
        <div className="login-glow login-glow-two" />
        <div className="login-circuit" />

        <div className="login-brand">
          <BrandMark />
          <div>
            <p>SGIMR</p>
            <span>Sistema de Gestión Integral Modular</span>
          </div>
        </div>

        <div className="login-command">
          <div className="command-kicker"><Sparkles size={15} /> Plataforma institucional</div>
          <h2>Todo el control.<br /><span>Una sola plataforma.</span></h2>
          <p>Una experiencia moderna para coordinar la gestión, asegurar la trazabilidad y tomar mejores decisiones.</p>

          <div className="login-capabilities">
            {capabilities.map(([title, description]) => (
              <article key={title}>
                <span><Layers3 size={16} /></span>
                <div><strong>{title}</strong><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>

        <div className="login-trust"><ShieldCheck size={16} /> Entorno seguro · Gestión confiable</div>
      </section>
    </main>
  )
}
