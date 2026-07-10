import { useState } from 'react'
import {
  ArrowRight, CheckCircle2, Eye, EyeOff, FileText, Fingerprint,
  HeartPulse, LockKeyhole, Mail, Radar, ShieldCheck, UserCog,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Button } from '@/shared/ui'

const controlPoints = [
  ['Usuarios', 'Roles, permisos y estados de acceso'],
  ['ALMERA', 'Solicitudes, evidencias y seguimiento'],
  ['Entidad', 'ESE Salud Yopal y modulos activos'],
]

const accessSignals = [
  ['RBAC', '4 roles base'],
  ['Permisos', '13 controles'],
  ['Sesion', 'Cookie segura'],
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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesion') }
    finally { setLoading(false) }
  }

  return (
    <main className="login-screen">
      <section className="login-intel">
        <div className="login-grid" />
        <div className="login-brand">
          <div className="brand-mark"><HeartPulse size={24} /></div>
          <div>
            <p>SGIMR</p>
            <span>Gestion ALMERA institucional</span>
          </div>
        </div>

        <div className="login-command">
          <div className="command-kicker"><Radar size={16} /> consola administrativa</div>
          <h1>Centro de control para operar usuarios, roles y gestion ALMERA.</h1>
          <p>
            Una base oscura, seria y modular para administrar la entidad activa,
            controlar accesos y preparar el crecimiento hacia auditorias, matrices,
            indicadores, PAMEC, MIPG y evidencias.
          </p>
        </div>

        <div className="login-matrix">
          {controlPoints.map(([title, text], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="login-access">
        <div className="access-card">
          <div className="access-card-head">
            <div>
              <p className="eyebrow">Acceso seguro</p>
              <h2>Entrar a SGIMR</h2>
            </div>
            <div className="access-shield"><ShieldCheck /></div>
          </div>

          <div className="access-signals">
            {accessSignals.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <form onSubmit={submit} className="access-form">
            <label>
              <span>Correo institucional</span>
              <div className="login-input">
                <Mail size={18} />
                <input autoComplete="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="usuario@sgimr.cloud" />
              </div>
            </label>

            <label>
              <span>Clave de acceso</span>
              <div className="login-input">
                <LockKeyhole size={18} />
                <input autoComplete="current-password" type={show ? 'text' : 'password'} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Contrasena" />
                <button type="button" aria-label="Mostrar contrasena" onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <div className="access-error">{error}</div>}

            <Button disabled={!ready || loading} className="access-submit">
              {loading ? 'Verificando credenciales...' : <>Ingresar al panel <ArrowRight size={17} /></>}
            </Button>
          </form>

          <div className="access-foot">
            <span><Fingerprint size={15} /> Sesion protegida</span>
            <span><CheckCircle2 size={15} /> Entidad verificada</span>
          </div>
        </div>

        <div className="login-route">
          <div><UserCog size={17} /><span>Usuarios</span></div>
          <div><FileText size={17} /><span>ALMERA</span></div>
          <div><ShieldCheck size={17} /><span>Permisos</span></div>
        </div>
      </section>
    </main>
  )
}
