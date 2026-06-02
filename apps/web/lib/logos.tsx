// Ecosystem partner logo marks — inline SVGs, brand-accurate, zero external deps

export function SuiLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 4C32 4 10 24 10 38C10 50.15 19.85 60 32 60C44.15 60 54 50.15 54 38C54 24 32 4 32 4Z" fill="#4DA2FF"/>
    </svg>
  );
}

export function WalrusLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" fill="#00D4AA" opacity="0.15" stroke="#00D4AA" strokeWidth="1.5"/>
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="700" fontFamily="monospace" fill="#00D4AA">W</text>
    </svg>
  );
}

export function SealLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 3L27 8.5V16C27 22.075 22.075 27 16 27C9.925 27 5 22.075 5 16V8.5L16 3Z"
        fill="#4DA2FF" opacity="0.15" stroke="#4DA2FF" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M12 16L15 19L20 13" stroke="#4DA2FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function EnokiLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" fill="#FFB830" opacity="0.15" stroke="#FFB830" strokeWidth="1.5"/>
      <circle cx="16" cy="12" r="4" fill="none" stroke="#FFB830" strokeWidth="1.5"/>
      <path d="M13 15.5L10 22M19 15.5L22 22M13 22H19" stroke="#FFB830" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function ZkLoginLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="14" width="22" height="14" rx="3" fill="#00D4AA" opacity="0.15" stroke="#00D4AA" strokeWidth="1.5"/>
      <path d="M11 14V10C11 7.239 13.239 5 16 5C18.761 5 21 7.239 21 10V14"
        stroke="#00D4AA" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="21" r="2" fill="#00D4AA"/>
    </svg>
  );
}

export function PTBLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="10" height="10" rx="2" fill="#4DA2FF" opacity="0.3" stroke="#4DA2FF" strokeWidth="1.2"/>
      <rect x="18" y="4" width="10" height="10" rx="2" fill="#4DA2FF" opacity="0.3" stroke="#4DA2FF" strokeWidth="1.2"/>
      <rect x="4" y="18" width="10" height="10" rx="2" fill="#4DA2FF" opacity="0.3" stroke="#4DA2FF" strokeWidth="1.2"/>
      <rect x="18" y="18" width="10" height="10" rx="2" fill="#4DA2FF" opacity="0.5" stroke="#4DA2FF" strokeWidth="1.2"/>
      <path d="M14 9H18M23 14V18M9 14V18M14 23H18" stroke="#4DA2FF" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}