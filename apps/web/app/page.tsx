import Link from 'next/link';
import { ArrowRight, BadgeCheck, Gamepad2, Search, ShieldCheck, Star, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import type { OrganizerPublic, TournamentCard as Card } from '@/lib/types';
import { TournamentCard } from '@/components/tournament-card';
import { Avatar, EmptyState, ReputationPill } from '@/components/ui';
import { VerifiedBadge } from '@/components/verified-badge';
import { COUNTRIES, flag } from '@/lib/format';

interface HomeData {
  upcoming: Card[];
  recent: Card[];
  featured: Card[];
  organizers: (OrganizerPublic & { _count: { tournaments: number } })[];
  sports: { id: string; name: string; slug: string; _count: { tournaments: number } }[];
  games: { id: string; name: string; slug: string; category: string; logoUrl: string | null; _count: { tournaments: number } }[];
}

export default async function HomePage() {
  const data = await api<HomeData>('/home', { auth: false });

  return (
    <div className="space-y-16">
      {/* Banner principal */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-14 sm:px-10 md:py-20">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-neon/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-96 rounded-full bg-neon-2/15 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }}
        />
        <div className="relative max-w-3xl">
          <p className="chip mb-5 border-neon/40 text-neon">
            <Trophy className="size-3.5" /> Deportes y eSports en un solo lugar
          </p>
          <h1 className="text-5xl font-bold uppercase leading-[0.95] sm:text-6xl md:text-7xl">
            Compite. Organiza. <span className="neon-text">Gana.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Encuentra partidas de fútbol, básquet, EA Sports FC, Valorant y más. Organizadores verificados y reputación transparente
            antes de inscribirte.
          </p>
          <form action="/torneos" className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar torneos</span>
              <Search className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input name="q" placeholder="Buscar torneos, juegos u organizadores" className="input h-12 pl-11 text-base" />
            </label>
            <button className="btn-primary h-12 px-6">Buscar</button>
          </form>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link href="/registro" className="btn-accent">
              Organiza tu torneo gratis <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Categorías */}
      <section className="grid gap-6 lg:grid-cols-2">
        <CategoryBlock
          title="Videojuegos"
          icon={<Gamepad2 className="size-5 text-neon-2" />}
          items={data.games.map((g) => ({ name: g.name, href: `/torneos?category=ESPORT&game=${g.slug}`, count: g._count.tournaments }))}
        />
        <CategoryBlock
          title="Deportes"
          icon={<Trophy className="size-5 text-lime" />}
          items={data.sports.map((s) => ({ name: s.name, href: `/torneos?category=SPORT&sport=${s.slug}`, count: s._count.tournaments }))}
        />
      </section>

      {data.featured.length > 0 && (
        <Section title="Torneos destacados" href="/torneos?featured=true">
          <Grid items={data.featured} />
        </Section>
      )}

      <Section title="Próximas partidas" href="/torneos?sort=upcoming">
        {data.upcoming.length ? (
          <Grid items={data.upcoming} />
        ) : (
          <EmptyState title="Aún no hay partidas abiertas" action={<Link href="/registro" className="btn-primary">Crea la primera</Link>} />
        )}
      </Section>

      {data.recent.length > 0 && (
        <Section title="Partidas recientes" href="/torneos?status=FINISHED">
          <Grid items={data.recent} />
        </Section>
      )}

      {/* Organizadores destacados */}
      <Section title="Organizadores destacados" href="/organizadores">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.organizers.map((o) => (
            <Link key={o.id} href={`/organizer/${o.user.username}`} className="card flex items-center gap-3 p-4 transition hover:border-neon/50">
              <Avatar src={o.logoUrl} name={o.displayName} size={52} accent={o.primaryColor} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate font-semibold">{o.displayName}</p>
                  <VerifiedBadge organizer={o} />
                </div>
                <p className="text-xs text-muted">
                  {flag(o.country)} {o.city}, {COUNTRIES[o.country] ?? o.country} · {o._count.tournaments} torneos
                </p>
                <ReputationPill reputation={o.reputation} compact />
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Confianza */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { icon: <BadgeCheck className="size-6 text-verified" />, title: 'Organizadores verificados', text: 'La insignia azul indica que revisamos la identidad del organizador.' },
          { icon: <Star className="size-6 text-amber" />, title: 'Reputación real', text: 'Solo participantes confirmados pueden valorar, y siempre mostramos cuántas valoraciones hay.' },
          { icon: <ShieldCheck className="size-6 text-lime" />, title: 'Sin ventajas pagadas', text: 'El plan contratado nunca mejora la reputación, la insignia ni el ranking.' },
        ].map((f) => (
          <div key={f.title} className="card p-5">
            {f.icon}
            <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="section-title">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-sm font-semibold text-neon hover:underline">
            Ver todo <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Grid({ items }: { items: Card[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((t) => (
        <TournamentCard key={t.id} t={t} />
      ))}
    </div>
  );
}

function CategoryBlock({ title, icon, items }: { title: string; icon: React.ReactNode; items: { name: string; href: string; count: number }[] }) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold uppercase">
        {icon} {title}
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="chip px-3 py-1.5 text-sm text-ink transition hover:border-neon hover:text-neon">
            {i.name}
            {i.count > 0 && <span className="rounded-full bg-neon/15 px-1.5 text-[10px] font-bold text-neon">{i.count}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
