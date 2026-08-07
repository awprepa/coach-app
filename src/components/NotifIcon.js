// Icônes de notifications côté coach — un badge coloré par type, plus
// lisible d'un coup d'œil qu'une cloche générique pour tout.
const CONFIG = {
  blessure: {
    bg: '#fee2e2', stroke: '#dc2626',
    path: <path d="M12 5v14M5 12h14" />,
  },
  rpe_absence: {
    bg: '#ffedd5', stroke: '#ea580c',
    path: <><path d="M12 9v4" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 17h.01" /></>,
  },
  rpe: {
    bg: '#dbeafe', stroke: '#2563eb',
    path: <><circle cx="12" cy="13" r="7" /><path d="M12 13l3-3" /><path d="M9 3h6" /></>,
  },
  wellness: {
    bg: '#ede9fe', stroke: '#7c3aed',
    path: <path d="M20.8 4.6a5 5 0 0 0-7.1 0L12 6.3l-1.7-1.7a5 5 0 1 0-7 7.1l1.6 1.6L12 20l7.1-7.1 1.6-1.6a5 5 0 0 0 0-6.7Z" />,
  },
  seance: {
    bg: '#dcfce7', stroke: '#16a34a',
    path: <path d="M20 6 9 17l-5-5" />,
  },
  pr: {
    bg: '#fef3c7', stroke: '#ca8a04',
    path: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4a2 2 0 0 0 2 4" /><path d="M17 6h3a2 2 0 0 1-2 4" /></>,
  },
  video: {
    bg: '#dbeafe', stroke: '#2563eb',
    path: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-4v12l-6-4" /></>,
  },
  contrat: {
    bg: '#f3f4f6', stroke: '#374151',
    path: <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><path d="M9 13h6M9 17h6" /></>,
  },
  calendrier: {
    bg: '#f3f4f6', stroke: '#374151',
    path: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4M16 3v4" /><path d="M12 14v4M10 16h4" /></>,
  },
  message: {
    bg: '#dbeafe', stroke: '#2563eb',
    path: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  default: {
    bg: '#f3f4f6', stroke: '#6b7280',
    path: <><path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  },
}

export default function NotifIcon({ type, size = 38 }) {
  const cfg = CONFIG[type] || CONFIG.default
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke={cfg.stroke} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        {cfg.path}
      </svg>
    </div>
  )
}
