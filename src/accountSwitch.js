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

/** Bascule vers l'autre compte.
 *  IMPORTANT : ne jamais passer par une déconnexion — signOut révoque les
 *  jetons côté serveur et casserait la bascule retour. Première fois (ou
 *  jeton expiré) : on amène directement à l'écran de connexion SANS se
 *  déconnecter ; la connexion à l'autre compte remplace la session locale
 *  et laisse la session actuelle valable pour la bascule retour. */
export async function switchAccount(currentEmail) {
  const target = otherAccount(currentEmail)
  const stored = load()[target]
  if (!stored) {
    alert("Première bascule : connecte-toi à l'autre compte sur l'écran qui suit (sans te déconnecter). Ensuite, la bascule sera instantanée dans les deux sens.")
    sessionStorage.setItem('aw_switch_pending', '1')   // laisse /login s'afficher malgré la session active
    window.location.href = '/login'
    return false
  }
  const { data, error } = await supabase.auth.setSession(stored)
  if (error || !data?.session) {
    const all = load(); delete all[target]; save(all)
    alert("La session de l'autre compte a expiré. Connecte-toi à l'autre compte sur l'écran qui suit (sans te déconnecter) pour réactiver la bascule.")
    sessionStorage.setItem('aw_switch_pending', '1')
    window.location.href = '/login'
    return false
  }
  // Les nouveaux jetons (rotation) sont ré-enregistrés au rechargement
  // via l'événement INITIAL_SESSION.
  window.location.href = '/'
  return true
}
