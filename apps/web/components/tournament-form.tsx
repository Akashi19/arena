'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createTournamentAction, updateTournamentAction } from '@/app/actions';
import { COUNTRIES, CURRENCIES, FORMAT_LABEL, LEVEL_LABEL, PLATFORM_LABEL, toLocalInput } from '@/lib/format';
import type { Discipline, TournamentDetail } from '@/lib/types';
import { FormMessage, ImageField, SubmitButton, TzOffsetInput, usePersistentAction } from './forms';

interface Props {
  sports: Discipline[];
  games: (Discipline & { platforms?: string[]; ranks?: { id: string; rankName: string; rankOrder: number }[] })[];
  maxParticipantsLimit: number;
  initial?: TournamentDetail & { sportId?: string; gameId?: string };
  /** Cobro de cuotas: si la cuenta de Mercado Pago está conectada y la comisión de Arena del plan */
  collect: { canCollect: boolean; feePercent: number };
}

const CHANNEL_PLACEHOLDERS = ['https://www.twitch.tv/tu-canal', 'https://www.youtube.com/@tu-canal', 'https://www.tiktok.com/@tu-canal', 'https://www.facebook.com/tu-pagina'];

/** Formulario de creación/edición de partidas. Toda validación definitiva ocurre en la API. */
export function TournamentForm({ sports, games, maxParticipantsLimit, initial, collect }: Props) {
  const editing = !!initial;
  const [state, onSubmit, pending] = usePersistentAction(editing ? updateTournamentAction : createTournamentAction, {});
  const [category, setCategory] = useState<'ESPORT' | 'SPORT'>(initial?.category ?? 'ESPORT');
  const [format, setFormat] = useState(initial?.format ?? 'SINGLE_ELIMINATION');
  const [online, setOnline] = useState(initial?.isOnline ?? category === 'ESPORT');
  const [gameId, setGameId] = useState(initial?.game?.id ?? games[0]?.id ?? '');
  const [fee, setFee] = useState(initial ? Number(initial.entryFee) : 0);
  // 4 casillas como mínimo (máx. 6 en la API); los canales ya guardados ocupan las primeras
  const savedChannels = (initial?.streamChannels ?? []).map((c) => c.url);
  const channelSlots = [...savedChannels, ...Array(Math.max(0, 4 - savedChannels.length)).fill('')] as string[];
  // Toda cuota mayor que cero se cobra con Mercado Pago
  const paid = fee > 0;
  const locked = initial?.status === 'IN_PROGRESS';
  const platforms = games.find((g) => g.id === gameId)?.platforms ?? Object.keys(PLATFORM_LABEL);
  const ranks = games.find((g) => g.id === gameId)?.ranks ?? [];
  // Los rangos guardados solo valen para el juego original
  const sameGame = initial?.game?.id === gameId;

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-6">
      {editing && <input type="hidden" name="id" value={initial.id} />}
      {locked && <input type="hidden" name="locked" value="1" />}
      <TzOffsetInput />

      <Section title="Información general">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="label">Nombre de la partida *</span>
            <input name="name" required minLength={3} maxLength={100} defaultValue={initial?.name} className="input" placeholder="Copa Relámpago – Fecha 1" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Nombre del torneo / competición</span>
            <input name="competitionName" maxLength={100} defaultValue={initial?.competition?.name} className="input" placeholder="Copa Internacional 2026 (opcional)" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Descripción</span>
            <textarea name="description" rows={3} maxLength={5000} defaultValue={initial?.description ?? ''} className="input" />
          </label>
          {!editing && <ImageField name="cover" label="Imagen de portada (opcional)" />}
        </div>
      </Section>

      <Section title="Disciplina">
        <fieldset disabled={locked} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <span className="label">Tipo de competición *</span>
            <div className="grid max-w-md grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1 text-sm font-semibold">
              {(['ESPORT', 'SPORT'] as const).map((c) => (
                <label key={c} className={`cursor-pointer rounded-lg py-2 text-center ${category === c ? 'bg-neon text-bg' : 'text-muted'}`}>
                  <input type="radio" name="category" value={c} checked={category === c} onChange={() => { setCategory(c); setOnline(c === 'ESPORT'); }} className="sr-only" />
                  {c === 'ESPORT' ? 'Videojuego / eSport' : 'Deporte tradicional'}
                </label>
              ))}
            </div>
          </div>
          {category === 'ESPORT' ? (
            <>
              <label className="block">
                <span className="label">Videojuego *</span>
                <select name="gameId" required className="input" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Plataforma</span>
                <select name="platform" className="input" defaultValue={initial?.platform ?? ''}>
                  <option value="">Sin especificar</option>
                  {platforms.map((p) => (
                    <option key={p} value={p}>{PLATFORM_LABEL[p] ?? p}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="block">
              <span className="label">Deporte *</span>
              <select name="sportId" required className="input" defaultValue={initial?.sport?.id}>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      </Section>

      <Section title="Fechas y cupos">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="label">Inicio (fecha y hora) *</span>
            <input type="datetime-local" name="startsAt" required defaultValue={toLocalInput(initial?.startsAt)} className="input" />
          </label>
          <label className="block">
            <span className="label">Límite de inscripción *</span>
            <input type="datetime-local" name="registrationDeadline" required defaultValue={toLocalInput(initial?.registrationDeadline)} className="input" />
          </label>
          <label className="block">
            <span className="label">Máx. participantes *</span>
            <input type="number" name="maxParticipants" required min={2} max={1024} defaultValue={initial?.maxParticipants ?? 16} className="input" />
            <span className="mt-1 block text-xs text-muted">Tu plan permite hasta {maxParticipantsLimit}.</span>
          </label>
          {editing && (
            <label className="block md:col-span-3">
              <span className="label">Motivo del cambio de horario (se notifica a los inscritos)</span>
              <input name="changeReason" maxLength={300} className="input" />
            </label>
          )}
        </div>
      </Section>

      <Section title="Formato">
        <fieldset disabled={locked} className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="label">Modalidad *</span>
            <select name="mode" className="input" defaultValue={initial?.mode ?? 'INDIVIDUAL'}>
              <option value="INDIVIDUAL">Individual</option>
              <option value="TEAM">Por equipos</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Formato *</span>
            <select name="format" className="input" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              {Object.entries(FORMAT_LABEL).map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </label>
          {(format === 'GROUPS' || format === 'GROUPS_PLAYOFFS') && (
            <label className="block">
              <span className="label">Número de grupos *</span>
              <input type="number" name="groupCount" min={2} max={32} required defaultValue={initial?.groupCount ?? 4} className="input" />
            </label>
          )}
          {format === 'GROUPS_PLAYOFFS' && (
            <label className="block">
              <span className="label">Clasifican por grupo *</span>
              <input type="number" name="qualifiersPerGroup" min={1} max={8} required defaultValue={initial?.qualifiersPerGroup ?? 2} className="input" />
            </label>
          )}
          {category === 'ESPORT' && (
            <>
              <label className="block">
                <span className="label">Nivel mínimo</span>
                <select name="minLevel" className="input" defaultValue={initial?.minLevel ?? ''}>
                  <option value="">Sin requisito</option>
                  {Object.entries(LEVEL_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">Nivel máximo</span>
                <select name="maxLevel" className="input" defaultValue={initial?.maxLevel ?? ''}>
                  <option value="">Sin requisito</option>
                  {Object.entries(LEVEL_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              {ranks.length > 0 ? (
                <>
                  <label className="block">
                    <span className="label">Rango mínimo</span>
                    <select key={`min-${gameId}`} name="minRankId" className="input" defaultValue={sameGame ? (initial?.minRankId ?? '') : ''}>
                      <option value="">Sin requisito</option>
                      {ranks.map((r) => <option key={r.id} value={r.id}>{r.rankName}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Rango máximo</span>
                    <select key={`max-${gameId}`} name="maxRankId" className="input" defaultValue={sameGame ? (initial?.maxRankId ?? '') : ''}>
                      <option value="">Sin requisito</option>
                      {ranks.map((r) => <option key={r.id} value={r.id}>{r.rankName}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <input type="hidden" name="minRankId" value="" />
                  <input type="hidden" name="maxRankId" value="" />
                </>
              )}
              <p className="text-xs text-muted md:col-span-2">
                Los requisitos se comprueban al inscribirse con el perfil gamer del jugador (en equipos, con el de cada integrante).
              </p>
            </>
          )}
        </fieldset>
      </Section>

      <Section title="Ubicación">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input type="checkbox" name="isOnline" checked={online} onChange={(e) => setOnline(e.target.checked)} className="accent-[var(--color-neon)]" />
            Partida online
          </label>
          {!online && (
            <label className="block">
              <span className="label">Lugar / sede *</span>
              <input name="location" required maxLength={200} defaultValue={initial?.location ?? ''} className="input" />
            </label>
          )}
          <label className="block">
            <span className="label">País</span>
            <select name="country" className="input" defaultValue={initial?.country ?? ''}>
              <option value="">{online ? 'Internacional' : 'El de mi perfil'}</option>
              {Object.entries(COUNTRIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Ciudad</span>
            <input name="city" maxLength={80} defaultValue={initial?.city ?? ''} className="input" />
          </label>
        </div>
      </Section>

      <Section title="Cuota de participación">
        <p className="-mt-2 mb-3 text-xs text-muted">
          Con monto 0 la inscripción es gratuita. Si fijas una cuota, los jugadores la pagan al inscribirse con Mercado Pago: el
          dinero llega a tu cuenta o, si cobras a través de Arena, te lo transferimos al terminar la partida. No es una apuesta.
        </p>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <label className="block">
            <span className="label">Monto</span>
            <input
              type="number"
              name="entryFee"
              min={0}
              step="0.01"
              defaultValue={initial ? Number(initial.entryFee) : 0}
              onChange={(e) => setFee(Number(e.target.value) || 0)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Moneda</span>
            <select name="currency" className="input" defaultValue={initial?.currency ?? 'USD'}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {paid &&
          (collect.canCollect ? (
            <p className="mt-4 rounded-xl border border-line bg-surface-2/40 p-3 text-xs text-muted">
              Se cobra con Mercado Pago: el cupo se reserva mientras el jugador paga y la inscripción se aprueba sola al
              confirmarse el pago. Comisión de Arena: {collect.feePercent} % por inscripción (más la de Mercado Pago).
            </p>
          ) : (
            <p className="mt-4 rounded-xl border border-amber/40 bg-amber/5 p-3 text-xs">
              Las cuotas se cobran con Mercado Pago. Para publicar una partida con cuota, primero{' '}
              <Link href="/dashboard/cobros" className="font-semibold text-neon underline">
                conecta tu cuenta o activa el cobro a través de Arena en «Cobros»
              </Link>{' '}
              o deja el monto en 0.
            </p>
          ))}
      </Section>

      <Section title="Transmisión en redes sociales">
        <p className="-mt-2 mb-3 text-xs text-muted">
          Opcional. Enlaces a los canales donde transmitirás los encuentros (YouTube, Twitch, Facebook, TikTok o Kick). Se
          muestran en la página de la partida junto a las transmisiones que configures en cada encuentro.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {channelSlots.map((url, i) => (
            <label key={i} className="block">
              <span className="label">Canal {i + 1}</span>
              <input
                type="url"
                inputMode="url"
                name="streamChannels"
                maxLength={500}
                defaultValue={url}
                placeholder={CHANNEL_PLACEHOLDERS[i % CHANNEL_PLACEHOLDERS.length]}
                className="input"
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Premio">
        <p className="-mt-2 mb-3 text-xs text-muted">
          Opcional. Se muestra en el buscador y en la página de la partida. Ejemplo: «500 USD al campeón» o «Teclado mecánico + 200
          USD».
        </p>
        <label className="block max-w-xl">
          <span className="label">Premio</span>
          <input
            type="text"
            name="prize"
            maxLength={200}
            defaultValue={initial?.prize ?? ''}
            placeholder="Sin premio"
            className="input"
          />
        </label>
      </Section>

      <Section title="Reglamento">
        <div className="grid gap-4">
          <label className="block">
            <span className="label">Reglamento de la partida</span>
            <textarea name="rules" rows={6} maxLength={20000} defaultValue={initial?.rules ?? ''} className="input font-mono text-xs" />
          </label>
          <label className="block">
            <span className="label">Condiciones de cancelación y devolución</span>
            <textarea name="refundPolicy" rows={2} maxLength={5000} defaultValue={initial?.refundPolicy ?? ''} className="input" />
          </label>
        </div>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface/95 p-4 backdrop-blur sm:flex-row sm:items-center">
        <div className="flex-1">
          <FormMessage state={state} />
        </div>
        {!editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="draft" className="accent-[var(--color-neon)]" /> Guardar como borrador
          </label>
        )}
        <SubmitButton pending={pending} pendingText={editing ? 'Guardando…' : 'Publicando…'}>{editing ? 'Guardar cambios' : 'Crear partida'}</SubmitButton>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-lg font-bold uppercase">{title}</h2>
      {children}
    </section>
  );
}
