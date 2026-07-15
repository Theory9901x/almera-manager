import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, Card, PageHeader, moduleIdentity } from '@/design-system'

export default function MyAccountPage() {
  const { session } = useAuth()
  const initials = (session?.user.fullName || '').split(' ').slice(0, 2).map(part => part[0]).join('')
  const identity = moduleIdentity('users')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Mi cuenta" title="Gestión de usuario" description="Tu información de cuenta dentro de la entidad." identity={identity} />

      <Card accent={identity.color} className="p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full text-lg font-black text-white" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}>{initials}</div>
          <div>
            <p className="text-lg font-black">{session?.user.fullName}</p>
            <p className="text-sm text-[var(--muted)]">{session?.user.email}</p>
            <Badge tone="info">{session?.role.name}</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-t border-[var(--border-hairline)] pt-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">Cargo</span>
            <strong>{session?.position?.name || 'Sin asignar'}</strong>
          </div>
          <p className="text-xs text-[var(--muted)]">El cargo lo asigna el administrador de la entidad.</p>
        </div>
      </Card>
    </div>
  )
}
