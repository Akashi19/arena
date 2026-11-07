import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="font-display text-8xl font-bold neon-text">404</p>
      <h1 className="mt-2 text-2xl font-bold uppercase">No encontramos esta página</h1>
      <p className="mt-1 text-muted">Puede que la partida haya sido eliminada o el enlace sea incorrecto.</p>
      <Link href="/torneos" className="btn-primary mt-6">
        Explorar torneos
      </Link>
    </div>
  );
}
