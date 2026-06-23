import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'

export function useUserFilter() {
  const { appMode } = useAppStore()
  const { usuario } = useAuthStore()
  const uid = usuario?.id ?? null

  function filterByUser<T>(arr: T[]): T[] {
    // If a user is logged in (GCI), ALWAYS filter by their uid — ignore appMode
    if (uid !== null) {
      return arr.filter((x: any) => x.usuario_id === uid)
    }
    // Almera mode (no user): show only records with no user assignment
    return arr.filter((x: any) => x.usuario_id == null)
  }

  /** Clave que cambia cuando cambia el usuario o el modo — úsala en useEffect deps */
  const filterKey = `${appMode ?? 'none'}-${uid ?? 'anon'}`

  /** usuario_id que se guarda al crear. GCI → id del usuario, Almera → null */
  const createUid: number | null = appMode === 'gci' ? uid : null

  return { filterByUser, createUid, filterKey }
}
