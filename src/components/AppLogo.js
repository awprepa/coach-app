import { useClientTheme } from '../context/ClientThemeContext'

/**
 * Logo de l'app : affiche le logo du club si disponible,
 * sinon le texte "AWprepa" par défaut.
 *
 * Props :
 *   size    — taille du logo image en px (défaut 36)
 *   style   — styles supplémentaires sur le conteneur texte
 *   imgStyle — styles supplémentaires sur l'image
 */
export default function AppLogo({ size = 54, style = {}, imgStyle = {} }) {
  const { logoUrl, clubName } = useClientTheme()

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={clubName || 'Club'}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 8,
          flexShrink: 0,
          ...imgStyle,
        }}
      />
    )
  }

  // Fallback logo AWprepa
  return (
    <img src="/logo-blanc.png" alt="AWprepa" style={{ height: size, width: 'auto', display: 'block', objectFit: 'contain', ...imgStyle }} />
  )
}
