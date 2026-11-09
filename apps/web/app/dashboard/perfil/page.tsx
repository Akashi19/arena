import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import { ImageUpload } from '@/components/forms';
import type { OrganizerFull } from '@/lib/types';
import { BecomeOrganizerForm, OrganizerForm, ProfileForm, SecurityForm } from './profile-forms';

export const metadata: Metadata = { title: 'Perfil y logo' };


export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ activar?: string }> }) {
  const me = await requireMe('/dashboard/perfil');
  const { activar } = await searchParams;
  const [organizer, sub] = me.organizerProfile
    ? await Promise.all([api<OrganizerFull>('/me/organizer'), api<{ plan: { features: string[]; name: string } }>('/me/subscription')])
    : [null, null];
  const fullCustomization = !!sub?.plan.features.includes('FULL_CUSTOMIZATION');

  return (
    <div className="space-y-6">
      <h1 className="section-title">Perfil y logo</h1>

      {organizer ? (
        <section className="card space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold uppercase">Identidad del organizador</h2>
            <Link href={`/organizer/${me.username}`} className="text-sm text-neon hover:underline">
              Ver perfil público
            </Link>
          </div>
          <p className="text-sm text-muted">Tu logo se muestra automáticamente en tus partidas, tarjetas, tablas y perfil público.</p>
          <div className="grid gap-5 md:grid-cols-[auto_1fr]">
            <ImageUpload target="logo" current={organizer.logoUrl} label="Logo" />
            {fullCustomization ? (
              <ImageUpload target="banner" current={organizer.bannerUrl} label="Banner del perfil" shape="wide" />
            ) : (
              <div className="grid place-items-center rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">
                El banner y el color de marca están disponibles desde el plan Pro.{' '}
                <Link href="/dashboard/suscripcion" className="text-neon underline">Ver planes</Link>
              </div>
            )}
          </div>
          <OrganizerForm organizer={organizer} canCustomize={fullCustomization} />
        </section>
      ) : (
        <section id="organizador" className={`card p-5 ${activar ? 'border-neon-2/60 shadow-neon-2' : ''}`}>
          <h2 className="text-xl font-bold uppercase">Activar perfil de organizador</h2>
          <p className="mb-4 text-sm text-muted">Crea tu espacio para organizar partidas. Empiezas en el plan Free.</p>
          <BecomeOrganizerForm defaultName={`${me.profile.firstName} ${me.profile.lastName}`} />
        </section>
      )}

      <section className="card space-y-5 p-5">
        <h2 className="text-xl font-bold uppercase">Datos personales</h2>
        <ImageUpload target="avatar" current={me.profile.avatarUrl} label="Foto de perfil / avatar" />
        <ProfileForm me={me} />
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="security-title">
        <h2 id="security-title" className="text-xl font-bold uppercase">
          Seguridad
        </h2>
        <SecurityForm />
      </section>
    </div>
  );
}
