// Vibration API — fonctionne sur Android Chrome, ignorée sur iOS Safari
const vib = (pattern) => {
  try { navigator.vibrate?.(pattern) } catch (_) {}
}

export const haptics = {
  tap:     () => vib(8),          // navigation, tap léger
  light:   () => vib(15),         // action secondaire
  medium:  () => vib(30),         // bouton principal
  success: () => vib([20, 40, 20]), // exercice / bilan validé
  error:   () => vib([80, 60, 80]), // erreur
}
