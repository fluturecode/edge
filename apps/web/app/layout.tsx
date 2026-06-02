import './globals.css';
import { NavBar } from '@/components/navbar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        background: '#080C14',
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-thumb { background: #1A2740; border-radius: 2px; }
          @media (max-width: 640px) {
            .nav-built-on { display: none !important; }
            .nav-links { display: none !important; }
          }
        `}</style>
        <NavBar />
        <div style={{ flex: 1 }}>
          {children}
        </div>
        <footer style={{
          textAlign: 'center',
          padding: '24px',
          borderTop: '1px solid #1A2740',
          fontFamily: 'DM Mono, monospace',
          fontSize: 11,
          color: '#2E4060',
          letterSpacing: '0.08em',
        }}>
          The best infrastructure is invisible.
        </footer>
      </body>
    </html>
  );
}