'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, GitBranch, Radio, Shuffle, Trophy, Tv } from 'lucide-react';
import { generateFixtureAction, generatePlayoffsAction, recordResultAction, updateMatchAction } from '@/app/actions';
import type { Fixture, FixtureMatch } from '@/lib/types';
import { buildSections, entrantName, formatScore, isElimination } from '@/lib/fixture';
import { FORMAT_LABEL, formatDateTime, toLocalInput } from '@/lib/format';
import { FormMessage, SubmitButton, TzOffsetInput, usePersistentAction } from '@/components/forms';
import { StandingsTable } from '@/components/fixture-view';
import { StreamBadge } from '@/components/stream';

export function FixtureManager({ fixture }: { fixture: Fixture }) {
  const t = fixture.tournament;
  const sections = buildSections(fixture);
  const editable = t.status === 'IN_PROGRESS';
  const hasResults = fixture.progress.completed > 0;
  const team = t.mode === 'TEAM';
  const qualifiers = t.format === 'GROUPS_PLAYOFFS' ? (t.qualifiersPerGroup ?? 0) : 0;

  return (
    <div className="space-y-5">
      {editable && !hasResults && <GenerateCard tournamentId={t.id} format={t.format} existing={fixture.matches.length > 0} />}
      {fixture.canGeneratePlayoffs && <PlayoffsCard tournamentId={t.id} qualifiers={t.qualifiersPerGroup ?? 1} />}

      {fixture.matches.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
          <Trophy className="size-5 text-neon" />
          <span>
            <b>{fixture.progress.completed}</b> de <b>{fixture.progress.total}</b> encuentros con resultado
          </span>
          {editable && fixture.progress.completed === fixture.progress.total && !fixture.canGeneratePlayoffs && (
            <span className="ml-auto text-lime">Fixture completo: ya puedes finalizar la partida.</span>
          )}
        </div>
      )}

      {sections.map((s) => (
        <section key={s.key} className="space-y-3">
          <h3 className="font-display text-lg font-bold uppercase tracking-wide text-neon-2">{s.title}</h3>
          {s.standings && s.standings.length > 0 && <StandingsTable rows={s.standings} team={team} qualifiers={qualifiers} />}
          {s.rounds.map((r) => (
            <div key={r.title} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{r.title}</p>
              <div className="grid gap-2 xl:grid-cols-2">
                {r.matches.map((m) => (
                  <MatchEditor key={m.id} match={m} tournamentId={t.id} editable={editable} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function GenerateCard({ tournamentId, format, existing }: { tournamentId: string; format: Fixture['tournament']['format']; existing: boolean }) {
  const [state, onSubmit, pending] = usePersistentAction(generateFixtureAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="card space-y-3 p-5">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div className="flex items-start gap-3">
        <GitBranch className="mt-0.5 size-5 shrink-0 text-neon" />
        <div>
          <h3 className="font-bold">{existing ? 'Regenerar fixture' : 'Generar fixture'}</h3>
          <p className="text-sm text-muted">
            Formato <b>{FORMAT_LABEL[format]}</b> con los participantes aprobados.{' '}
            {existing
              ? 'Mientras no haya resultados puedes volver a generarlo (por ejemplo, tras cambiar la siembra).'
              : 'Los mejores sembrados reciben los byes; los participantes reciben una notificación.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="shuffle" className="size-4 accent-[var(--color-neon)]" />
          <Shuffle className="size-4 text-muted" /> Sortear participantes sin siembra
        </label>
        <label className="block">
          <span className="label">Programar rondas cada (min, opcional)</span>
          <input type="number" name="roundIntervalMinutes" min={5} max={20160} placeholder="Ej.: 60" className="input w-40" />
        </label>
        <SubmitButton pending={pending} pendingText="Generando…">
          {existing ? 'Regenerar' : 'Generar fixture'}
        </SubmitButton>
      </div>
      <details className="rounded-xl border border-line bg-surface-2 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Tv className="size-4 text-neon" aria-hidden /> Transmisión en vivo (opcional)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="label">Canal para todos los encuentros</span>
            <input name="streamUrl" type="url" inputMode="url" maxLength={500} placeholder="https://www.twitch.tv/tu-canal" className="input" />
          </label>
          <label className="block">
            <span className="label">Visibilidad</span>
            <select name="streamVisibility" defaultValue="PUBLIC" className="input">
              <option value="PUBLIC">Pública</option>
              <option value="PRIVATE">Solo participantes</option>
            </select>
          </label>
          <p className="text-xs text-muted sm:col-span-2">
            Solo HTTPS de YouTube, Twitch, Facebook, TikTok, Kick u otra plataforma autorizada. Cada encuentro queda programado con este enlace y luego
            puedes cambiarlo, activarlo EN VIVO o quitarlo desde el encuentro.
          </p>
        </div>
      </details>
      <FormMessage state={state} />
    </form>
  );
}

function PlayoffsCard({ tournamentId, qualifiers }: { tournamentId: string; qualifiers: number }) {
  const [state, onSubmit, pending] = usePersistentAction(generatePlayoffsAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="card flex flex-wrap items-center gap-3 border-neon/40 p-5">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <Trophy className="size-5 text-neon" />
      <p className="flex-1 text-sm">
        Terminó la fase de grupos. Clasifican los <b>{qualifiers}</b> mejores de cada grupo a la llave final.
      </p>
      <SubmitButton pending={pending} pendingText="Generando…">
        Generar playoffs
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function MatchEditor({ match, tournamentId, editable }: { match: FixtureMatch; tournamentId: string; editable: boolean }) {
  const [result, onResult, savingResult] = usePersistentAction(recordResultAction, {});
  const [meta, onMeta, savingMeta] = usePersistentAction(updateMatchAction, {});
  const [showSchedule, setShowSchedule] = useState(false);
  const [p1, p2] = [1, 2].map((s) => match.participants.find((p) => p.slot === s));
  const ready = !!p1 && !!p2;
  const done = match.status === 'COMPLETED';
  const elimination = isElimination(match.bracket);
  const canEdit = editable && match.status !== 'CANCELLED';

  return (
    <div className={`card space-y-2 p-3 ${match.status === 'LIVE' ? 'border-danger/60' : ''}`}>
      <form method="post"
        key={`${match.result?.version ?? 0}-${p1?.registration.id}-${p2?.registration.id}`}
        onSubmit={onResult}
        className="space-y-2"
      >
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="matchId" value={match.id} />
        <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 text-sm">
          <span className={`truncate text-right ${p1?.isWinner ? 'font-semibold text-neon' : ''}`}>{entrantName(p1?.registration)}</span>
          <ScoreInput name="score1" defaultValue={formatScore(p1?.score ?? null)} disabled={!canEdit || !ready} label={`Marcador de ${entrantName(p1?.registration)}`} />
          <span className="text-muted">-</span>
          <ScoreInput name="score2" defaultValue={formatScore(p2?.score ?? null)} disabled={!canEdit || !ready} label={`Marcador de ${entrantName(p2?.registration)}`} />
          <span className={`truncate ${p2?.isWinner ? 'font-semibold text-neon' : ''}`}>{entrantName(p2?.registration)}</span>
        </div>

        {canEdit && ready && (
          <div className="flex flex-wrap items-center gap-2">
            {elimination && (
              <select name="winnerSlot" defaultValue="" className="input w-auto py-1.5 text-xs" aria-label="Desempate">
                <option value="">Desempate: no aplica</option>
                <option value="1">Desempate: avanza {entrantName(p1?.registration)}</option>
                <option value="2">Desempate: avanza {entrantName(p2?.registration)}</option>
              </select>
            )}
            {done && (
              <input
                name="reason"
                required
                minLength={5}
                maxLength={500}
                placeholder="Motivo de la corrección"
                className="input min-w-40 flex-1 py-1.5 text-xs"
              />
            )}
            <SubmitButton pending={savingResult} className="btn-primary px-3 py-1.5 text-xs" pendingText="…">
              {done ? 'Corregir' : 'Guardar resultado'}
            </SubmitButton>
          </div>
        )}
        <FormMessage state={result} />
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {match.status === 'LIVE' && (
          <span className="flex items-center gap-1 font-semibold uppercase text-danger">
            <Radio className="size-3 animate-pulse" /> En vivo
          </span>
        )}
        {!ready && <span className="italic">Esperando a los participantes</span>}
        {match.scheduledAt && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3" /> {formatDateTime(match.scheduledAt)}
          </span>
        )}
        {match.venue && <span>· {match.venue}</span>}
        {match.result && match.result.version > 1 && <span className="text-amber">· v{match.result.version} (corregido)</span>}
        {match.stream && match.stream.status !== 'NOT_CONFIGURED' && <StreamBadge status={match.stream.status} />}
        {canEdit && !done && (
          <span className="ml-auto flex gap-1">
            {ready && match.status !== 'LIVE' && (
              <form method="post" onSubmit={onMeta}>
                <input type="hidden" name="tournamentId" value={tournamentId} />
                <input type="hidden" name="matchId" value={match.id} />
                <SubmitButton name="status" value="LIVE" pending={savingMeta} className="btn-ghost px-2 py-1 text-xs" pendingText="…">
                  <Radio className="size-3" /> En vivo
                </SubmitButton>
              </form>
            )}
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowSchedule((v) => !v)}>
              <CalendarClock className="size-3" /> Horario
            </button>
          </span>
        )}
        {match.status !== 'CANCELLED' && (
          <Link href={`/dashboard/torneos/${tournamentId}/encuentros/${match.id}`} className={`btn-ghost px-2 py-1 text-xs ${canEdit && !done ? '' : 'ml-auto'}`}>
            <Tv className="size-3" /> Transmisión
          </Link>
        )}
      </div>

      {showSchedule && canEdit && !done && (
        <form method="post" onSubmit={onMeta} className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3 sm:grid-cols-2">
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="matchId" value={match.id} />
          <TzOffsetInput />
          <label className="block">
            <span className="label">Fecha y hora</span>
            <input type="datetime-local" name="scheduledAt" defaultValue={toLocalInput(match.scheduledAt)} className="input" />
          </label>
          <label className="block">
            <span className="label">Sede / sala</span>
            <input name="venue" defaultValue={match.venue ?? ''} maxLength={160} placeholder="Cancha 2, servidor EU…" className="input" />
          </label>
          {match.scheduledAt && (
            <label className="block sm:col-span-2">
              <span className="label">Motivo de la reprogramación (se notifica)</span>
              <input name="reason" maxLength={300} className="input" />
            </label>
          )}
          <div className="sm:col-span-2">
            <SubmitButton pending={savingMeta} className="btn-primary px-3 py-1.5 text-xs" pendingText="Guardando…">
              Guardar horario
            </SubmitButton>
          </div>
        </form>
      )}
      <FormMessage state={meta} />
    </div>
  );
}

function ScoreInput({ name, defaultValue, disabled, label }: { name: string; defaultValue: string; disabled: boolean; label: string }) {
  return (
    <input
      type="number"
      name={name}
      min={0}
      step="any"
      required
      defaultValue={defaultValue}
      disabled={disabled}
      aria-label={label}
      className="input w-16 px-2 py-1.5 text-center font-display text-base font-bold tabular-nums disabled:opacity-50"
    />
  );
}
