'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { clearSessionCookies, setSessionCookies } from '@/lib/session';

export interface ActionState {
  ok?: boolean;
  error?: string;
  planLimit?: boolean;
  message?: string;
}

function fail(e: unknown): ActionState {
  if (e instanceof ApiError) return { error: e.message, planLimit: e.isPlanLimit };
  console.error(e);
  return { error: 'No se pudo completar la operación. Intenta nuevamente.' };
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === undefined ? undefined : Number(v);
};
/** datetime-local llega sin zona; el formulario envía también el offset del navegador. */
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return undefined;
  const offset = str(fd, 'tzOffset');
  const d = new Date(v);
  if (offset !== undefined && !Number.isNaN(Number(offset))) {
    const asUtc = new Date(`${v}:00Z`);
    return new Date(asUtc.getTime() + Number(offset) * 60_000).toISOString();
  }
  return d.toISOString();
};
const safeNext = (n: string | undefined) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard');

// ============================================================================ Autenticación

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next = '/dashboard';
  try {
    const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { identifier: str(fd, 'identifier'), password: fd.get('password') },
    });
    await setSessionCookies(tokens);
    next = safeNext(str(fd, 'next'));
  } catch (e) {
    return fail(e);
  }
  redirect(next);
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const asOrganizer = fd.get('asOrganizer') === 'on';
  try {
    const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        firstName: str(fd, 'firstName'),
        lastName: str(fd, 'lastName'),
        username: str(fd, 'username'),
        email: str(fd, 'email'),
        password: fd.get('password'),
        country: str(fd, 'country'),
        city: str(fd, 'city'),
        phone: str(fd, 'phone'),
        description: str(fd, 'description'),
        asOrganizer,
        organizerName: asOrganizer ? str(fd, 'organizerName') : undefined,
        organizerType: asOrganizer ? str(fd, 'organizerType') : undefined,
      },
    });
    await setSessionCookies(tokens);
    // Logo opcional subido en el mismo paso del registro
    const logo = fd.get('logo');
    if (logo instanceof File && logo.size > 0) {
      const form = new FormData();
      form.set('file', logo);
      try {
        await api(asOrganizer ? '/me/organizer/logo' : '/me/avatar', { method: 'POST', form });
      } catch {
        /* la cuenta ya existe; el logo puede subirse luego desde el perfil */
      }
    }
  } catch (e) {
    return fail(e);
  }
  redirect(asOrganizer ? '/dashboard' : '/torneos');
}

export async function logoutAction() {
  await clearSessionCookies();
  redirect('/');
}

// ============================================================================ Perfil

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/me/profile', {
      method: 'PATCH',
      body: {
        firstName: str(fd, 'firstName'),
        lastName: str(fd, 'lastName'),
        nickname: str(fd, 'nickname'),
        country: str(fd, 'country'),
        city: str(fd, 'city'),
        phone: (fd.get('phone') as string | null) ?? undefined,
        bio: (fd.get('bio') as string | null) ?? undefined,
        privacy: {
          showRealName: fd.get('showRealName') === 'on',
          showCountry: fd.get('showCountry') === 'on',
          showStats: fd.get('showStats') === 'on',
          showTeams: fd.get('showTeams') === 'on',
          showHistory: fd.get('showHistory') === 'on',
        },
      },
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Perfil actualizado' };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOrganizerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const socialLinks: Record<string, string> = {};
  for (const k of ['instagram', 'x', 'youtube', 'twitch', 'tiktok', 'facebook', 'discord', 'kick']) {
    const v = str(fd, `social_${k}`);
    if (v) socialLinks[k] = v;
  }
  try {
    await api('/me/organizer', {
      method: 'PATCH',
      body: {
        displayName: str(fd, 'displayName'),
        legalName: str(fd, 'legalName'),
        organizerType: str(fd, 'organizerType'),
        description: (fd.get('description') as string | null) ?? undefined,
        country: str(fd, 'country'),
        city: str(fd, 'city'),
        website: str(fd, 'website'),
        socialLinks,
        primaryColor: str(fd, 'primaryColor'),
      },
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Identidad del organizador actualizada' };
  } catch (e) {
    return fail(e);
  }
}

export async function becomeOrganizerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/me/become-organizer', {
      method: 'POST',
      body: { displayName: str(fd, 'displayName'), organizerType: str(fd, 'organizerType'), description: str(fd, 'description') },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/** Sube logo, banner, avatar, portada o escudo. `target` define el endpoint permitido. */
export async function uploadImageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const target = str(fd, 'target');
  const id = str(fd, 'id');
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecciona una imagen' };
  if (file.size > 5 * 1024 * 1024) return { error: 'La imagen supera 5 MB' };
  const uuid = /^[0-9a-f-]{36}$/i;
  const endpoints: Record<string, string | null> = {
    logo: '/me/organizer/logo',
    banner: '/me/organizer/banner',
    avatar: '/me/avatar',
    cover: id && uuid.test(id) ? `/tournaments/${id}/cover` : null,
    team: id && uuid.test(id) ? `/teams/${id}/logo` : null,
  };
  const endpoint = target ? endpoints[target] : null;
  if (!endpoint) return { error: 'Destino inválido' };
  const form = new FormData();
  form.set('file', file);
  try {
    await api(endpoint, { method: 'POST', form });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Imagen actualizada' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Partidas

function tournamentBody(fd: FormData) {
  const category = str(fd, 'category');
  const isOnline = fd.get('isOnline') === 'on';
  return {
    name: str(fd, 'name'),
    competitionName: str(fd, 'competitionName'),
    description: (fd.get('description') as string | null) ?? undefined,
    category,
    sportId: category === 'SPORT' ? str(fd, 'sportId') : undefined,
    gameId: category === 'ESPORT' ? str(fd, 'gameId') : undefined,
    platform: category === 'ESPORT' ? str(fd, 'platform') : undefined,
    startsAt: date(fd, 'startsAt'),
    registrationDeadline: date(fd, 'registrationDeadline'),
    maxParticipants: num(fd, 'maxParticipants'),
    mode: str(fd, 'mode'),
    format: str(fd, 'format'),
    groupCount: num(fd, 'groupCount'),
    qualifiersPerGroup: num(fd, 'qualifiersPerGroup'),
    isOnline,
    location: isOnline ? undefined : str(fd, 'location'),
    country: str(fd, 'country'),
    city: str(fd, 'city'),
    entryFee: num(fd, 'entryFee') ?? 0,
    currency: str(fd, 'currency'),
    rules: (fd.get('rules') as string | null) ?? undefined,
    refundPolicy: (fd.get('refundPolicy') as string | null) ?? undefined,
    minLevel: str(fd, 'minLevel'),
    maxLevel: str(fd, 'maxLevel'),
  };
}

export async function createTournamentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const t = await api<{ id: string }>('/tournaments', {
      method: 'POST',
      body: { ...tournamentBody(fd), draft: fd.get('draft') === 'on' },
    });
    id = t.id;
    const cover = fd.get('cover');
    if (cover instanceof File && cover.size > 0) {
      const form = new FormData();
      form.set('file', cover);
      await api(`/tournaments/${id}/cover`, { method: 'POST', form }).catch(() => undefined);
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/dashboard');
  redirect(`/dashboard/torneos/${id}?creada=1`);
}

export async function updateTournamentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'id');
  if (!id) return { error: 'Partida inválida' };
  const body = tournamentBody(fd);
  const locked = fd.get('locked') === '1';
  try {
    await api(`/tournaments/${id}`, {
      method: 'PATCH',
      body: {
        ...body,
        // Con la partida en curso no se envían campos estructurales
        ...(locked ? { category: undefined, sportId: undefined, gameId: undefined, mode: undefined, format: undefined } : {}),
        changeReason: str(fd, 'changeReason'),
      },
    });
    revalidatePath(`/dashboard/torneos/${id}`);
    revalidatePath('/torneos');
    return { ok: true, message: 'Partida actualizada' };
  } catch (e) {
    return fail(e);
  }
}

export async function changeTournamentStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'id');
  try {
    await api(`/tournaments/${id}/status`, { method: 'PATCH', body: { status: str(fd, 'status') } });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: 'Estado actualizado' };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelTournamentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'id');
  try {
    await api(`/tournaments/${id}/cancel`, { method: 'POST', body: { reason: str(fd, 'reason') } });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: 'Partida cancelada y participantes notificados' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Inscripciones

export async function requestRegistrationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'tournamentId');
  try {
    await api(`/tournaments/${id}/registrations`, {
      method: 'POST',
      body: { teamId: str(fd, 'teamId'), notes: str(fd, 'notes'), acceptRules: fd.get('acceptRules') === 'on' },
    });
    revalidatePath(`/torneos/${str(fd, 'slug')}`);
    return { ok: true, message: 'Solicitud enviada. El organizador revisará tu inscripción.' };
  } catch (e) {
    return fail(e);
  }
}

export async function withdrawRegistrationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/registrations/${str(fd, 'registrationId')}`, { method: 'DELETE' });
    revalidatePath(`/torneos/${str(fd, 'slug')}`);
    revalidatePath('/dashboard/inscripciones');
    return { ok: true, message: 'Inscripción retirada' };
  } catch (e) {
    return fail(e);
  }
}

export async function decideRegistrationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/registrations/${str(fd, 'registrationId')}`, {
      method: 'PATCH',
      body: { status: str(fd, 'status'), note: str(fd, 'note') },
    });
    revalidatePath(`/dashboard/torneos/${str(fd, 'tournamentId')}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Equipos

export async function createTeamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const discipline = str(fd, 'discipline') ?? '';
  const [kind, disciplineId] = discipline.split(':');
  try {
    const team = await api<{ id: string }>('/teams', {
      method: 'POST',
      body: {
        name: str(fd, 'name'),
        tag: str(fd, 'tag'),
        country: str(fd, 'country'),
        description: str(fd, 'description'),
        sportId: kind === 'sport' ? disciplineId : undefined,
        gameId: kind === 'game' ? disciplineId : undefined,
      },
    });
    const logo = fd.get('logo');
    if (logo instanceof File && logo.size > 0) {
      const form = new FormData();
      form.set('file', logo);
      await api(`/teams/${team.id}/logo`, { method: 'POST', form }).catch(() => undefined);
    }
    revalidatePath('/dashboard/equipos');
    return { ok: true, message: 'Equipo creado' };
  } catch (e) {
    return fail(e);
  }
}

export async function addTeamMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/teams/${str(fd, 'teamId')}/members`, {
      method: 'POST',
      body: { username: str(fd, 'username'), role: str(fd, 'role'), jerseyNumber: num(fd, 'jerseyNumber') },
    });
    revalidatePath('/dashboard/equipos');
    return { ok: true, message: 'Jugador agregado' };
  } catch (e) {
    return fail(e);
  }
}

export async function removeTeamMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/teams/${str(fd, 'teamId')}/members/${str(fd, 'playerId')}`, { method: 'DELETE' });
    revalidatePath('/dashboard/equipos');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCaptainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/teams/${str(fd, 'teamId')}/captain`, { method: 'PATCH', body: { playerId: str(fd, 'playerId') } });
    revalidatePath('/dashboard/equipos');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTeamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/teams/${str(fd, 'teamId')}`, { method: 'DELETE' });
    revalidatePath('/dashboard/equipos');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Fixture y resultados

export async function generateFixtureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'tournamentId');
  try {
    const res = await api<{ matches: number }>(`/tournaments/${id}/fixture`, {
      method: 'POST',
      body: { shuffle: fd.get('shuffle') === 'on', roundIntervalMinutes: num(fd, 'roundIntervalMinutes') },
    });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: `Fixture generado: ${res.matches} encuentros. Los participantes fueron notificados.` };
  } catch (e) {
    return fail(e);
  }
}

export async function generatePlayoffsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'tournamentId');
  try {
    const res = await api<{ matches: number }>(`/tournaments/${id}/playoffs`, { method: 'POST' });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: `Playoffs generados: ${res.matches} encuentros` };
  } catch (e) {
    return fail(e);
  }
}

export async function recordResultAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'tournamentId');
  try {
    await api(`/matches/${str(fd, 'matchId')}/result`, {
      method: 'POST',
      body: { score1: num(fd, 'score1'), score2: num(fd, 'score2'), winnerSlot: num(fd, 'winnerSlot'), reason: str(fd, 'reason') },
    });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: 'Resultado guardado' };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMatchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'tournamentId');
  try {
    await api(`/matches/${str(fd, 'matchId')}`, {
      method: 'PATCH',
      body: { scheduledAt: date(fd, 'scheduledAt'), venue: fd.has('venue') ? (str(fd, 'venue') ?? '') : undefined, status: str(fd, 'status'), reason: str(fd, 'reason') },
    });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: str(fd, 'status') === 'LIVE' ? 'Encuentro marcado en vivo' : 'Encuentro actualizado' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Notificaciones

export async function markAllReadAction() {
  await api('/me/notifications/read-all', { method: 'POST' }).catch(() => undefined);
  revalidatePath('/', 'layout');
}
