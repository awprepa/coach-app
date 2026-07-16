// ── Bascule rapide entre les 2 comptes d'Arthur (coach ↔ client) ─────────────
// Réservé à ses deux emails : le bouton n'apparaît pour personne d'autre.
//
// Approche fiable (v2) : plus aucun jeton stocké/rejoué sur l'appareil (fragile —
// Supabase invalide un refresh token dès qu'il est réutilisé). À chaque bascule on
// demande une session NEUVE à la fonction Edge `switch-account`, qui vérifie côté
// serveur que l'appelant est bien connecté à l'un des 2 comptes d'Arthur avant de
// délivrer une session pour l'autre. Marche à tous les coups, dans les deux sens,
// dès la première fois.
import { supabase } from './supabase'

export const COACH_EMAIL  = 'wehrey.arthur@gmail.com'
export const CLIENT_EMAIL = 'a.r.t.h.u.r@outlook.fr'

/** Compat : plus rien à initialiser (l'ancienne v1 conservait des jetons ici).
 *  On purge d'éventuels restes de l'ancienne approche. */
export function initAccountSwitch() {
  try { localStorage.removeItem('aw_switch_sessions') } catch {}
}

/** La bascule n'est proposée qu'à Arthur (l'un de ses 2 emails). */
export function canSwitch(currentEmail) {
  return currentEmail === COACH_EMAIL || currentEmail === CLIENT_EMAIL
}

export function otherAccount(currentEmail) {
  return currentEmail === COACH_EMAIL ? CLIENT_EMAIL : COACH_EMAIL
}

/** Clé de stockage de session utilisée par supabase-js : sb-<ref>-auth-token. */
function storageKey() {
  try {
    const ref = new URL(process.env.REACT_APP_SUPABASE_URL).hostname.split('.')[0]
    return `sb-${ref}-auth-token`
  } catch {
    return 'sb-ytdqyhajqxnmkwxehwmg-auth-token'
  }
}

/** Bascule vers l'autre compte : session neuve générée côté serveur.
 *  On écrit la session DIRECTEMENT dans le stockage puis on recharge : c'est la
 *  seule méthode fiable ici (setSession seul ne persistait pas la session avant
 *  le rechargement — la bascule « réussissait » sans jamais changer de compte). */
export async function switchAccount() {
  try {
    const { data, error } = await supabase.functions.invoke('switch-account')
    const s = data?.session
    if (error || !s?.access_token || !s?.refresh_token) {
      alert("Bascule impossible pour le moment. Réessaie dans un instant.")
      return false
    }

    // Persistance garantie : on remplace la session stockée par la nouvelle.
    localStorage.setItem(storageKey(), JSON.stringify({
      access_token:  s.access_token,
      refresh_token: s.refresh_token,
      expires_at:    s.expires_at,
      expires_in:    s.expires_in,
      token_type:    s.token_type || 'bearer',
      user:          s.user,
    }))

    // Rechargement complet : la nouvelle session est lue au démarrage et AuthGate
    // route vers le bon espace (coach ou client) selon le compte.
    window.location.href = '/'
    return true
  } catch (e) {
    alert("Bascule impossible pour le moment. Réessaie dans un instant.")
    return false
  }
}
