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
    // "" quita el requisito; si el formulario no trae el campo, no se toca
    minRankId: fd.has('minRankId') ? (category === 'ESPORT' ? (str(fd, 'minRankId') ?? '') : '') : undefined,
    maxRankId: fd.has('maxRankId') ? (category === 'ESPORT' ? (str(fd, 'maxRankId') ?? '') : '') : undefined,
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

export async function addTeamGuestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/teams/${str(fd, 'teamId')}/guests`, {
      method: 'POST',
      body: { fullName: str(fd, 'fullName'), nickname: str(fd, 'nickname'), role: str(fd, 'role'), jerseyNumber: num(fd, 'jerseyNumber') },
    });
    revalidatePath('/dashboard/equipos');
    return { ok: true, message: 'Jugador sin cuenta agregado' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Jugador y perfiles gamer

export async function updatePlayerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/me/player', {
      method: 'PATCH',
      body: {
        recruitmentStatus: str(fd, 'recruitmentStatus'),
        position: str(fd, 'position') ?? '',
        availability: str(fd, 'availability') ?? '',
        jerseyNumber: num(fd, 'jerseyNumber'),
      },
    });
    revalidatePath('/dashboard/juegos');
    return { ok: true, message: 'Ficha de jugador actualizada' };
  } catch (e) {
    return fail(e);
  }
}

export async function saveGameProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'id');
  const body = {
    platform: str(fd, 'platform'),
    gamerTag: str(fd, 'gamerTag'),
    competitiveLevel: str(fd, 'competitiveLevel'),
    gameRankId: str(fd, 'gameRankId') ?? (id ? null : undefined),
    playerRole: str(fd, 'playerRole') ?? (id ? '' : undefined),
    experienceYears: num(fd, 'experienceYears'),
    isPrimary: fd.get('isPrimary') === 'on' ? true : undefined,
    isFeatured: fd.get('isFeatured') === 'on',
    isFavorite: fd.get('isFavorite') === 'on',
  };
  try {
    if (id) await api(`/me/games/${id}`, { method: 'PATCH', body });
    else await api('/me/games', { method: 'POST', body: { ...body, gameId: str(fd, 'gameId') } });
    revalidatePath('/dashboard/juegos');
    return { ok: true, message: id ? 'Perfil actualizado' : 'Videojuego agregado a tu perfil' };
  } catch (e) {
    return fail(e);
  }
}

export async function removeGameProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/me/games/${str(fd, 'id')}`, { method: 'DELETE' });
    revalidatePath('/dashboard/juegos');
    return { ok: true, message: 'Videojuego retirado de tu perfil' };
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
      body: {
        shuffle: fd.get('shuffle') === 'on',
        roundIntervalMinutes: num(fd, 'roundIntervalMinutes'),
        streamUrl: str(fd, 'streamUrl'),
        streamVisibility: str(fd, 'streamUrl') ? (str(fd, 'streamVisibility') ?? 'PUBLIC') : undefined,
      },
    });
    revalidatePath(`/dashboard/torneos/${id}`);
    return { ok: true, message: `Fixture generado: ${res.matches} encuentros. Los participantes fueron notificados.` };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Transmisiones (módulo 23)

function revalidateStream(fd: FormData) {
  const tid = str(fd, 'tournamentId');
  const mid = str(fd, 'matchId');
  revalidatePath(`/dashboard/torneos/${tid}`);
  revalidatePath(`/dashboard/torneos/${tid}/encuentros/${mid}`);
  revalidatePath(`/encuentros/${mid}`);
}

function streamBody(fd: FormData) {
  return {
    url: str(fd, 'url'),
    title: fd.has('title') ? (str(fd, 'title') ?? '') : undefined,
    description: fd.has('description') ? (str(fd, 'description') ?? '') : undefined,
    visibility: str(fd, 'visibility'),
    scheduledStartAt: date(fd, 'scheduledStartAt'),
    scheduledEndAt: date(fd, 'scheduledEndAt'),
    reason: str(fd, 'reason'),
  };
}

export async function saveStreamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const matchId = str(fd, 'matchId');
  const streamId = str(fd, 'streamId');
  try {
    if (streamId) {
      await api(`/matches/${matchId}/stream`, { method: 'PUT', body: { ...streamBody(fd), streamId } });
    } else {
      await api(`/matches/${matchId}/stream`, { method: 'POST', body: { ...streamBody(fd), isRebroadcast: fd.get('isRebroadcast') === 'on' } });
    }
    revalidateStream(fd);
    return { ok: true, message: streamId ? 'Transmisión actualizada' : 'Transmisión configurada' };
  } catch (e) {
    return fail(e);
  }
}

export async function streamStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/matches/${str(fd, 'matchId')}/stream/status`, {
      method: 'PATCH',
      body: { status: str(fd, 'status'), reason: str(fd, 'reason'), streamId: str(fd, 'streamId') },
    });
    revalidateStream(fd);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteStreamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/matches/${str(fd, 'matchId')}/stream`, { method: 'DELETE', query: { streamId: str(fd, 'streamId'), reason: str(fd, 'reason') } });
    revalidateStream(fd);
    return { ok: true, message: 'Enlace eliminado. El historial se conserva.' };
  } catch (e) {
    return fail(e);
  }
}

export async function setNotificationPreferenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/me/notification-preferences', {
      method: 'PUT',
      body: { type: str(fd, 'type'), inApp: fd.get('inApp') === 'on', email: fd.get('email') === 'on', whatsapp: fd.get('whatsapp') === 'on' },
    });
    revalidatePath('/notificaciones');
    return { ok: true, message: 'Preferencia guardada' };
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

// ============================================================================ Confianza: verificación

const MAX_VERIFICATION_UPLOAD = 25 * 1024 * 1024;

function collectFiles(fd: FormData, key: string) {
  return fd.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);
}

export async function requestVerificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const files = collectFiles(fd, 'documents');
  if (files.reduce((s, f) => s + f.size, 0) > MAX_VERIFICATION_UPLOAD) return { error: 'Los documentos superan 25 MB en total' };
  const social: Record<string, string> = {};
  for (const k of ['instagram', 'x', 'youtube', 'twitch', 'tiktok', 'facebook', 'discord', 'kick']) {
    const v = str(fd, `social_${k}`);
    if (v) social[k] = v;
  }
  const form = new FormData();
  for (const k of ['organizerName', 'legalName', 'verificationType', 'country', 'city', 'contactEmail', 'contactPhone', 'description', 'website']) {
    const v = str(fd, k);
    if (v) form.set(k, v);
  }
  form.set('socialLinks', JSON.stringify(social));
  form.set('documentTypes', JSON.stringify(files.map(() => str(fd, 'documentType') ?? 'SUPPORTING_DOCUMENT')));
  form.set('acceptPolicy', fd.get('acceptPolicy') === 'on' ? 'true' : 'false');
  for (const f of files) form.append('documents', f, f.name);
  try {
    await api('/me/verification', { method: 'POST', form });
    revalidatePath('/dashboard/verificacion');
    return { ok: true, message: 'Solicitud enviada. Te avisaremos cuando comience la revisión.' };
  } catch (e) {
    return fail(e);
  }
}

export async function provideVerificationInfoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const files = collectFiles(fd, 'documents');
  if (files.reduce((s, f) => s + f.size, 0) > MAX_VERIFICATION_UPLOAD) return { error: 'Los documentos superan 25 MB en total' };
  const form = new FormData();
  form.set('message', str(fd, 'message') ?? '');
  for (const f of files) form.append('documents', f, f.name);
  try {
    await api('/me/verification/info', { method: 'POST', form });
    revalidatePath('/dashboard/verificacion');
    return { ok: true, message: 'Información enviada al equipo de verificación' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Confianza: valoraciones e incidencias

export async function rateOrganizerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const scores = {
    organizationScore: num(fd, 'organizationScore'),
    punctualityScore: num(fd, 'punctualityScore'),
    communicationScore: num(fd, 'communicationScore'),
    transparencyScore: num(fd, 'transparencyScore'),
    overallExperienceScore: num(fd, 'overallExperienceScore'),
    comment: str(fd, 'comment') ?? '',
  };
  if (Object.values(scores).some((v) => v === undefined)) return { error: 'Califica los cinco criterios' };
  const ratingId = str(fd, 'ratingId');
  try {
    if (ratingId) await api(`/ratings/${ratingId}`, { method: 'PUT', body: scores });
    else await api(`/organizers/${str(fd, 'organizerId')}/ratings`, { method: 'POST', body: { ...scores, tournamentId: str(fd, 'tournamentId') } });
    revalidatePath(`/torneos/${str(fd, 'slug')}`);
    return { ok: true, message: ratingId ? 'Valoración actualizada' : '¡Gracias por tu valoración!' };
  } catch (e) {
    return fail(e);
  }
}

export async function respondRatingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'ratingId');
  try {
    await api(`/ratings/${id}/responses`, { method: fd.get('edit') === '1' ? 'PUT' : 'POST', body: { response: str(fd, 'response') } });
    revalidatePath('/dashboard/reputacion');
    return { ok: true, message: 'Respuesta publicada' };
  } catch (e) {
    return fail(e);
  }
}

export async function reportRatingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/ratings/${str(fd, 'ratingId')}/reports`, { method: 'POST', body: { reason: str(fd, 'reason') } });
    return { ok: true, message: 'Reporte enviado al equipo de moderación' };
  } catch (e) {
    return fail(e);
  }
}

export async function reportIncidentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const evidence = fd.get('evidence');
  const form = new FormData();
  form.set('incidentType', str(fd, 'incidentType') ?? '');
  form.set('description', str(fd, 'description') ?? '');
  if (evidence instanceof File && evidence.size > 0) {
    if (evidence.size > 10 * 1024 * 1024) return { error: 'La evidencia supera 10 MB' };
    form.set('evidence', evidence, evidence.name);
  }
  try {
    await api(`/tournaments/${str(fd, 'tournamentId')}/incidents`, { method: 'POST', form });
    revalidatePath(`/torneos/${str(fd, 'slug')}`);
    return { ok: true, message: 'Incidencia enviada. Un administrador la revisará; solo las confirmadas se publican.' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ SUPERADMIN

export async function verificationAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'id');
  try {
    await api(`/admin/verifications/${id}/actions`, {
      method: 'POST',
      body: { action: str(fd, 'action'), reason: str(fd, 'reason'), comments: str(fd, 'comments'), months: num(fd, 'months') },
    });
    revalidatePath(`/admin/verificaciones/${id}`);
    revalidatePath('/admin/verificaciones');
    return { ok: true, message: 'Acción registrada y organizador notificado' };
  } catch (e) {
    return fail(e);
  }
}

/** Devuelve una URL firmada de 5 minutos (cada acceso queda auditado en la API). */
export async function privateFileUrlAction(kind: 'verification' | 'incident', id: string, documentId?: string): Promise<{ url?: string; error?: string }> {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(id) || (documentId && !uuid.test(documentId))) return { error: 'Identificador inválido' };
  try {
    const path = kind === 'verification' ? `/admin/verifications/${id}/documents/${documentId}` : `/admin/incidents/${id}/evidence`;
    const res = await api<{ url: string }>(path);
    return { url: res.url };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'No se pudo abrir el archivo' };
  }
}

export async function runVerificationMaintenanceAction(_: ActionState): Promise<ActionState> {
  try {
    const r = await api<{ expired: number; warned: number; purgedDocuments: number }>('/admin/verifications/maintenance', { method: 'POST' });
    revalidatePath('/admin/verificaciones');
    return { ok: true, message: `Vencidas: ${r.expired} · avisos: ${r.warned} · documentos eliminados: ${r.purgedDocuments}` };
  } catch (e) {
    return fail(e);
  }
}

export async function moderateRatingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/admin/ratings/${str(fd, 'id')}/moderation`, { method: 'PATCH', body: { status: str(fd, 'status'), reason: str(fd, 'reason') } });
    revalidatePath('/admin/valoraciones');
    return { ok: true, message: 'Moderación registrada' };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveIncidentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/admin/incidents/${str(fd, 'id')}/resolve`, { method: 'PUT', body: { status: str(fd, 'status'), resolution: str(fd, 'resolution') } });
    revalidatePath('/admin/incidencias');
    return { ok: true, message: 'Incidencia actualizada' };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewCancellationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/admin/tournaments/${str(fd, 'id')}/cancellation`, {
      method: 'PATCH',
      body: { justified: fd.get('justified') === 'true', reason: str(fd, 'reason') },
    });
    revalidatePath('/admin/reputacion');
    return { ok: true, message: 'Cancelación revisada y reputación recalculada' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Notificaciones

export async function markAllReadAction() {
  await api('/me/notifications/read-all', { method: 'POST' }).catch(() => undefined);
  revalidatePath('/', 'layout');
}

// ============================================================================ Módulo 21: reclutamiento, niveles y MVP

export async function inviteToTeamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/teams/${str(fd, 'teamId')}/invitations`, {
      method: 'POST',
      body: { username: str(fd, 'username'), message: str(fd, 'message') },
    });
    revalidatePath('/dashboard/equipos');
    return { ok: true, message: 'Invitación enviada' };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInvitationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/invitations/${str(fd, 'id')}`, { method: 'DELETE' });
    revalidatePath('/dashboard/equipos');
    return { ok: true, message: 'Invitación cancelada' };
  } catch (e) {
    return fail(e);
  }
}

export async function respondInvitationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const accept = str(fd, 'decision') === 'accept';
  try {
    await api(`/invitations/${str(fd, 'id')}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
    revalidatePath('/dashboard/equipos');
    revalidatePath('/dashboard');
    return { ok: true, message: accept ? 'Te uniste al equipo' : 'Invitación rechazada' };
  } catch (e) {
    return fail(e);
  }
}

/** Mueve un juego una posición arriba/abajo en el orden del perfil público. */
export async function moveGameProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ids = String(fd.get('order') ?? '').split(',').filter(Boolean);
  const i = ids.indexOf(String(fd.get('id')));
  const j = str(fd, 'direction') === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return {};
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  try {
    await api('/me/games/order', { method: 'PUT', body: { ids } });
    revalidatePath('/dashboard/juegos');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function levelVerificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const action = str(fd, 'action');
  try {
    await api(`/admin/game-profiles/${str(fd, 'id')}/verification`, {
      method: 'PUT',
      body: {
        action,
        source: action === 'EXTERNAL' ? str(fd, 'source') : undefined,
        competitiveLevel: action === 'EXTERNAL' ? str(fd, 'competitiveLevel') : undefined,
        gameRankId: action === 'EXTERNAL' ? str(fd, 'gameRankId') : undefined,
        reason: str(fd, 'reason'),
      },
    });
    revalidatePath('/admin/niveles');
    return { ok: true, message: action === 'EXTERNAL' ? 'Nivel validado externamente' : 'Validación retirada' };
  } catch (e) {
    return fail(e);
  }
}

export async function setMvpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/tournaments/${str(fd, 'tournamentId')}/mvp`, { method: 'PUT', body: { playerId: str(fd, 'playerId') ?? null } });
    revalidatePath(`/dashboard/torneos/${str(fd, 'tournamentId')}`);
    const slug = str(fd, 'slug');
    if (slug) revalidatePath(`/torneos/${slug}`);
    return { ok: true, message: str(fd, 'playerId') ? 'Jugador destacado guardado' : 'Jugador destacado quitado' };
  } catch (e) {
    return fail(e);
  }
}

// ============================================================================ Rankings (módulo 22)

export async function reportResultAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/rankings/reports', { method: 'POST', body: { matchId: str(fd, 'matchId'), reason: str(fd, 'reason') } });
    revalidatePath('/dashboard/ranking');
    return { ok: true, message: 'Reporte enviado: un administrador lo revisará' };
  } catch (e) {
    return fail(e);
  }
}

function revalidateRankingAdmin() {
  revalidatePath('/admin/rankings');
  revalidatePath('/admin/rankings/revision');
  revalidatePath('/rankings');
}

/** Select "TIPO:uuid" del panel de rankings. */
function participantOf(fd: FormData) {
  const [rankingType, participantId] = (str(fd, 'participant') ?? '').split(':');
  return { rankingType, participantId };
}

const dayStart = (v?: string) => (v ? new Date(`${v}T00:00:00Z`).toISOString() : undefined);
const dayEnd = (v?: string) => (v ? new Date(`${v}T23:59:59Z`).toISOString() : undefined);

export async function createSeasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/admin/ranking/seasons', {
      method: 'POST',
      body: {
        name: str(fd, 'name'),
        description: str(fd, 'description'),
        gameId: str(fd, 'gameId'),
        countryCode: str(fd, 'countryCode') ?? null,
        startDate: dayStart(str(fd, 'startDate')),
        endDate: dayEnd(str(fd, 'endDate')),
        minimumMatches: num(fd, 'minimumMatches'),
        status: str(fd, 'status'),
      },
    });
    revalidateRankingAdmin();
    return { ok: true, message: 'Temporada creada' };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSeasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/admin/ranking/seasons/${str(fd, 'id')}`, { method: 'PUT', body: { status: str(fd, 'status'), reason: str(fd, 'reason') } });
    revalidateRankingAdmin();
    return { ok: true, message: 'Temporada actualizada' };
  } catch (e) {
    return fail(e);
  }
}

export async function createRuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const placement: Record<string, number> = {};
  for (const k of ['1', '2', '3', '4']) {
    const v = num(fd, `place${k}`);
    if (v !== undefined) placement[k] = v;
  }
  const tierMultiplier: Record<string, number> = {};
  for (const k of ['1', '2', '3', '4', '5']) {
    const v = num(fd, `tier${k}`);
    if (v !== undefined) tierMultiplier[k] = v;
  }
  try {
    await api('/admin/ranking/rules', {
      method: 'POST',
      body: {
        gameId: str(fd, 'gameId'),
        competitionType: str(fd, 'competitionType'),
        minimumMatches: num(fd, 'minimumMatches'),
        effectiveFrom: dayStart(str(fd, 'effectiveFrom')),
        reason: str(fd, 'reason'),
        scoringConfiguration: {
          win: num(fd, 'win'),
          draw: num(fd, 'draw'),
          loss: num(fd, 'loss'),
          participation: num(fd, 'participation'),
          placement,
          tierMultiplier,
          maxPerTournament: num(fd, 'maxPerTournament') ?? null,
        },
      },
    });
    revalidateRankingAdmin();
    return { ok: true, message: 'Versión creada en borrador: actívala para aplicarla' };
  } catch (e) {
    return fail(e);
  }
}

export async function updateRuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await api<{ recalculation: { tournaments: number; created: number; reverted: number } | null }>(`/admin/ranking/rules/${str(fd, 'id')}`, {
      method: 'PUT',
      body: { status: str(fd, 'status'), reason: str(fd, 'reason') },
    });
    revalidateRankingAdmin();
    const rc = r.recalculation;
    return {
      ok: true,
      message: rc ? `Regla actualizada. Recalculados ${rc.tournaments} torneos (${rc.created} eventos nuevos, ${rc.reverted} revertidos)` : 'Regla actualizada',
    };
  } catch (e) {
    return fail(e);
  }
}

export async function recalculateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await api<{ games: number; tournaments: number; created: number; reverted: number }>('/admin/ranking/recalculate', {
      method: 'POST',
      body: { gameId: str(fd, 'gameId'), reason: str(fd, 'reason') },
    });
    revalidateRankingAdmin();
    return { ok: true, message: `Recalculado: ${r.games} juegos, ${r.tournaments} torneos, ${r.created} eventos nuevos y ${r.reverted} revertidos` };
  } catch (e) {
    return fail(e);
  }
}

export async function tournamentRankingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/admin/ranking/tournaments/${str(fd, 'id')}`, {
      method: 'PUT',
      body: { tier: num(fd, 'tier'), isRanked: fd.get('isRanked') === 'on', reason: str(fd, 'reason') },
    });
    revalidateRankingAdmin();
    return { ok: true, message: 'Partida actualizada' };
  } catch (e) {
    return fail(e);
  }
}

export async function revertEventAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api(`/admin/ranking/events/${str(fd, 'id')}/revert`, { method: 'POST', body: { reason: str(fd, 'reason') } });
    revalidateRankingAdmin();
    return { ok: true, message: 'Evento revertido' };
  } catch (e) {
    return fail(e);
  }
}

export async function adjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await api('/admin/ranking/adjustments', {
      method: 'POST',
      body: {
        ...participantOf(fd),
        gameId: str(fd, 'gameId'),
        points: num(fd, 'points'),
        reason: str(fd, 'reason'),
      },
    });
    revalidateRankingAdmin();
    return { ok: true, message: 'Ajuste aplicado' };
  } catch (e) {
    return fail(e);
  }
}

export async function suspensionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const lift = fd.get('action') === 'LIFT';
  try {
    await api('/admin/ranking/suspensions', {
      method: 'PUT',
      body: {
        ...participantOf(fd),
        until: lift ? null : (dayEnd(str(fd, 'until')) ?? null),
        reason: str(fd, 'reason'),
      },
    });
    revalidateRankingAdmin();
    return { ok: true, message: lift ? 'Suspensión levantada' : 'Participante suspendido del ranking' };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await api<{ revertedEvents: number }>(`/admin/ranking/reports/${str(fd, 'id')}`, {
      method: 'PUT',
      body: { decision: str(fd, 'decision'), resolution: str(fd, 'resolution') },
    });
    revalidateRankingAdmin();
    return { ok: true, message: str(fd, 'decision') === 'UPHELD' ? `Procede: ${r.revertedEvents} eventos revertidos` : 'Reporte desestimado' };
  } catch (e) {
    return fail(e);
  }
}
