import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'DSA Progress Hub',
  description: 'DSA + Placement preparation dashboard',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f5c3f',
};

// Runs before first paint so the saved theme and animation mode apply instantly (no flash of animations).
const initScript = `try{var d=document.documentElement;var m=localStorage.getItem('dph-anim');var r=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;d.dataset.motion=(m==='off'||r)?'off':'on';d.dataset.theme=localStorage.getItem('dph-theme')||'sepia';}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: initScript }} /></head><body>{children}</body></html>;
}
