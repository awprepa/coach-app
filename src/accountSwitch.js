// ── Bascule rapide entre les 2 comptes d'Arthur (coach ↔ client) ─────────────
// Réservé à ses deux emails : le bouton n'apparaît pour personne d'autre.
// Les jetons des deux comptes sont conservés sur l'appareil (localStorage,
// même niveau de sécurité que « rester connecté ») et réactualisés en continu
// via onAuthStateChange — y compris après rotation du refresh token.
import { supabase } from './supabase'

export const COACH_EMAIL  = 'wehrey.arthur@gmail.com'
export const CLIENT_EMAIL = 'a.r.t.h.u.r@outlook.fr'

const KEY = 'aw_switch_sessions'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)) } catch {}
}

/** À appeler une fois au démarrage de l'app : enregistre et réactualise
 *  silencieusement les jetons quand l'un des 2 comptes est connecté. */
export function initAccountSwitch() {
  supabase.auth.onAuthStateChange((_event, session) => {
    const email = session?.user?.email
    if (!email || (email !== COACH_EMAIL && email !== CLIENT_EMAIL)) return
    const all = load()
    all[email] = {
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    }
    save(all)
  })
}

/** La bascule n'est proposée qu'à Arthur (l'un de ses 2 emails). */
export function canSwitch(currentEmail) {
  return currentEmail === COACH_EMAIL || currentEmail === CLIENT_EMAIL
}

export function otherAccount(currentEmail) {
  return currentEmail === COACH_EMAIL ? CLIENT_EMAIL : COACH_EMAIL
}

/** Bascule vers l'autre compte. Retourne false si une (re)connexion manuelle
 *  est nécessaire (première fois, ou jeton expiré). */
export async function switchAccount(currentEmail) {
  const target = otherAccount(currentEmail)
  const stored = load()[target]
  if (!stored) {
    alert("Première utilisation : déconnecte-toi puis connecte-toi une fois à l'autre compte. La bascule sera ensuite instantanée.")
    return false
  }
  const { error } = await supabase.auth.setSession(stored)
  if (error) {
    const all = load(); delete all[target]; save(all)
    alert("La session enregistrée a expiré — reconnecte-toi une fois à l'autre compte pour réactiver la bascule.")
    return false
  }
  // setSession déclenche onAuthStateChange → les nouveaux jetons (rotation)
  // sont ré-enregistrés automatiquement avant le rechargement.
  window.location.href = '/'
  return true
}
