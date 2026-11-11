import type { Metadata, Viewport } from 'next';
import { Inter, Rajdhani } from 'next/font/google';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-rajdhani', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Arena · Torneos deportivos y eSports', template: '%s · Arena' },
  description:
    'Crea, administra y participa en torneos de deportes y videojuegos. Organizadores verificados, reputación transparente y resultados en tiempo real.',
};

export const viewport: Viewport = { themeColor: '#07080d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${rajdhani.variable}`}>
      <body className="font-sans antialiased">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-line/60 py-8 text-center text-xs text-muted">
          <p>
            Arena · Plataforma de torneos deportivos y eSports. Las cuotas de inscripción las fija cada organizador y, cuando se pagan en
            línea, llegan directo a su cuenta de Mercado Pago: no se trata de apuestas ni cuotas de pronóstico.
          </p>
          <p className="mt-2 flex justify-center gap-4">
            <Link href="/torneos" className="hover:text-neon">Torneos</Link>
            <Link href="/organizadores" className="hover:text-neon">Organizadores</Link>
            <Link href="/planes" className="hover:text-neon">Planes</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
