'use client';

import { usePathname, useRouter } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname?.startsWith('/dashboard');

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'clamp(12px, 2vw, 14px) clamp(16px, 4vw, 24px)',
      borderBottom: '1px solid #1A2740', background: '#080C14',
      position: 'sticky', top: 0, zIndex: 50, gap: 12,
    }}>
      <div
        onClick={() => router.push(isDashboard ? '/dashboard' : '/')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" stroke="#00D4AA" strokeWidth="1.5"/>
          <circle cx="16" cy="16" r="8" stroke="#00D4AA" strokeWidth="0.6" opacity="0.3"/>
          <path d="M16 4 L18.2 13.5 L16 16 Z" fill="#FFFFFF"/>
          <path d="M16 28 L13.8 18.5 L16 16 Z" fill="#5A7090"/>
          <circle cx="16" cy="16" r="1.5" fill="#00D4AA"/>
        </svg>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, color: '#FFFFFF', letterSpacing: '0.08em', fontWeight: 700 }}>EDGE</span>
        <div className="nav-built-on" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#5A7090' }}>built on</span>
          <svg width="13" height="13" viewBox="0 0 64 64" fill="none">
            <path d="M32 4C32 4 10 24 10 38C10 50.15 19.85 60 32 60C44.15 60 54 50.15 54 38C54 24 32 4 32 4Z" fill="#4DA2FF"/>
          </svg>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#5A7090' }}>Sui</span>
        </div>
      </div>

      {isDashboard && (
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {[
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Agent', path: '/dashboard/agent' },
          ].map(link => (
            <button
              key={link.path}
              onClick={() => router.push(link.path)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontFamily: 'DM Mono, monospace',
                color: pathname === link.path ? '#00D4AA' : '#5A7090',
                fontWeight: pathname === link.path ? 600 : 400,
                transition: 'color 0.2s', padding: '0 0 2px',
                borderBottom: pathname === link.path ? '1px solid #00D4AA' : '1px solid transparent',
              }}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ background: '#0D1420', border: '1px solid #1A2740', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D4AA', boxShadow: '0 0 6px #00D4AA', display: 'inline-block' }}/>
        <span style={{ fontSize: 11, color: '#5A7090', fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em' }}>MAINNET</span>
      </div>
    </nav>
  );
}