/**
 * Carga inicial de la comunidad de esports: 10 jugadores de Dota 2 y 10 de Valorant (con su perfil gamer y
 * rango), un organizador y dos torneos ya disputados por videojuego.
 *
 * Los torneos se juegan con los servicios reales de la API (fixture, resultados, playoffs y cierre), así que
 * posiciones, campeón, estadísticas, logros, reputación y ranking global quedan igual que en una partida real.
 * Las cuentas se crean con contraseñas aleatorias que no se guardan: nadie puede iniciar sesión con ellas
 * hasta restablecerlas. Idempotente: si el organizador ya existe, no hace nada.
 *
 * Uso (en el contenedor de la API): node dist/scripts/seed-esports.js
 */
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MatchesService } from '../matches/matches.js';
import { TournamentsService } from '../tournaments/tournaments.service.js';
import type { AuthUser } from '../common/decorators/auth.decorators.js';
import type { CompetitiveLevel, TournamentFormat } from '../generated/prisma/client.js';

const DAY = 864e5;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** Aleatorio reproducible (mismos resultados en cada entorno). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PlayerDef = [username: string, firstName: string, lastName: string, country: string, city: string, rank: string, role: string];

const ORGANIZER = {
  username: 'ligaandina',
  email: 'ligaandina@arenatourney.com',
  firstName: 'Gabriel',
  lastName: 'Mendoza',
  country: 'PE',
  city: 'Lima',
  displayName: 'Liga Andina Esports',
  description: 'Circuito competitivo de Dota 2 y Valorant para Latinoamérica. Torneos online cada mes.',
};

const DOTA: PlayerDef[] = [
  ['kaiser_dota', 'Rodrigo', 'Salazar', 'PE', 'Lima', 'Immortal', 'Mid'],
  ['wraith', 'Alejandro', 'Gutiérrez', 'PE', 'Arequipa', 'Divine', 'Carry'],
  ['mamba', 'Fernando', 'Cárdenas', 'BO', 'La Paz', 'Divine', 'Offlane'],
  ['sakura', 'Daniela', 'Ríos', 'CL', 'Santiago', 'Ancient', 'Soporte'],
  ['ghost_pe', 'Luis', 'Huamán', 'PE', 'Cusco', 'Ancient', 'Mid'],
  ['tormenta', 'Nicolás', 'Pereira', 'AR', 'Rosario', 'Legend', 'Carry'],
  ['ronin', 'Kevin', 'Villanueva', 'EC', 'Quito', 'Legend', 'Offlane'],
  ['axolotl', 'Mariana', 'Torres', 'MX', 'Monterrey', 'Archon', 'Soporte'],
  ['condor', 'Jorge', 'Mamani', 'PE', 'Puno', 'Archon', 'Hard support'],
  ['vortex', 'Santiago', 'Ospina', 'CO', 'Medellín', 'Crusader', 'Mid'],
];

const VALORANT: PlayerDef[] = [
  ['nyx', 'Valentina', 'Morales', 'CL', 'Santiago', 'Radiante', 'Duelista'],
  ['falcon', 'Emiliano', 'Rojas', 'MX', 'CDMX', 'Inmortal', 'Duelista'],
  ['ember', 'Sofía', 'Navarro', 'AR', 'Buenos Aires', 'Inmortal', 'Iniciador'],
  ['raze_pe', 'Bruno', 'Castillo', 'PE', 'Lima', 'Ascendente', 'Duelista'],
  ['onyx', 'Tomás', 'Benítez', 'UY', 'Montevideo', 'Ascendente', 'Controlador'],
  ['jaguar', 'Diego', 'Ramírez', 'CO', 'Cali', 'Diamante', 'Centinela'],
  ['lynx', 'Isabella', 'Fuentes', 'PE', 'Trujillo', 'Diamante', 'Iniciador'],
  ['bolt', 'Matías', 'Acosta', 'CL', 'Concepción', 'Platino', 'Duelista'],
  ['quetzal', 'Ximena', 'Hernández', 'MX', 'Puebla', 'Platino', 'Controlador'],
  ['sombra', 'Gonzalo', 'Paz', 'PE', 'Piura', 'Oro', 'Centinela'],
];

const LEVELS: CompetitiveLevel[] = ['PROFESSIONAL', 'EXPERT', 'EXPERT', 'ADVANCED', 'ADVANCED', 'ADVANCED', 'INTERMEDIATE', 'INTERMEDIATE', 'INTERMEDIATE', 'BEGINNER'];

interface TournamentDef {
  name: string;
  slug: string;
  description: string;
  rules: string;
  format: TournamentFormat;
  /** Participantes, por índice en la lista del juego (el índice también marca su nivel: 0 es el mejor). */
  players: number[];
  startsDaysAgo: number;
  tier: number;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const matches = app.get(MatchesService);
    const tournaments = app.get(TournamentsService);

    if (await prisma.user.findUnique({ where: { username: ORGANIZER.username } })) {
      console.log(`Ya existe "${ORGANIZER.username}": la carga de esports ya se hizo, no se crea nada.`);
      return;
    }
    const randomHash = () => bcrypt.hash(randomBytes(24).toString('base64url'), 10);
    const free = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'FREE' } });

    // ---------- Organizador
    const orgUser = await prisma.user.create({
      data: {
        email: ORGANIZER.email,
        username: ORGANIZER.username,
        passwordHash: await randomHash(),
        role: 'ORGANIZER',
        profile: { create: { firstName: ORGANIZER.firstName, lastName: ORGANIZER.lastName, country: ORGANIZER.country, city: ORGANIZER.city } },
        player: { create: { fullName: `${ORGANIZER.firstName} ${ORGANIZER.lastName}`, nickname: ORGANIZER.username, country: ORGANIZER.country } },
      },
    });
    const organizer = await prisma.organizerProfile.create({
      data: {
        userId: orgUser.id,
        displayName: ORGANIZER.displayName,
        description: ORGANIZER.description,
        organizerType: 'COMPANY',
        country: ORGANIZER.country,
        city: ORGANIZER.city,
        primaryColor: '#8b5cf6',
        members: { create: { userId: orgUser.id, role: 'OWNER' } },
        reputation: { create: {} },
      },
    });
    await prisma.subscription.create({
      data: {
        organizerId: organizer.id,
        planId: free.id,
        status: 'ACTIVE',
        currentPeriodStart: daysAgo(60),
        provider: 'MANUAL',
        history: { create: { toPlanId: free.id, toStatus: 'ACTIVE', reason: 'Alta del organizador' } },
      },
    });
    const actor: AuthUser = { id: orgUser.id, username: orgUser.username, role: 'ORGANIZER' };

    // ---------- Jugadores con su perfil gamer
    async function createPlayers(gameSlug: string, defs: PlayerDef[]) {
      const game = await prisma.game.findUniqueOrThrow({ where: { slug: gameSlug } });
      const ranks = await prisma.gameRank.findMany({ where: { gameId: game.id } });
      const result: { userId: string; playerId: string }[] = [];
      for (const [i, [username, firstName, lastName, country, city, rankName, role]] of defs.entries()) {
        const rank = ranks.find((r) => r.rankName === rankName);
        if (!rank) throw new Error(`Rango "${rankName}" no existe en ${game.name}`);
        const user = await prisma.user.create({
          data: {
            email: `${username.replace(/_/g, '.')}@arenatourney.com`,
            username,
            passwordHash: await randomHash(),
            role: 'PLAYER',
            createdAt: daysAgo(90 - i * 3),
            profile: { create: { firstName, lastName, country, city } },
            player: {
              create: {
                fullName: `${firstName} ${lastName}`,
                nickname: username,
                country,
                gameProfiles: {
                  create: {
                    gameId: game.id,
                    platform: 'PC',
                    gamerTag: gameSlug === 'valorant' ? `${username}#${(4100 + i * 37) % 10000}` : username,
                    competitiveLevel: LEVELS[i],
                    gameRankId: rank.id,
                    playerRole: role,
                    experienceYears: Math.max(1, 7 - Math.floor(i / 2)),
                    isPrimary: true,
                  },
                },
              },
            },
          },
          include: { player: true },
        });
        result.push({ userId: user.id, playerId: user.player!.id });
      }
      return { game, players: result };
    }

    // ---------- Torneo disputado con el motor real
    async function playTournament(gameId: string, players: { userId: string; playerId: string }[], def: TournamentDef, scoreFor: (rand: () => number) => [number, number], seed: number) {
      const rand = rng(seed);
      const startsAt = daysAgo(def.startsDaysAgo);
      const t = await prisma.tournament.create({
        data: {
          organizerId: organizer.id,
          name: def.name,
          slug: def.slug,
          description: def.description,
          rules: def.rules,
          category: 'ESPORT',
          gameId,
          platform: 'PC',
          startsAt,
          registrationDeadline: new Date(startsAt.getTime() - 2 * DAY),
          maxParticipants: def.players.length,
          mode: 'INDIVIDUAL',
          format: def.format,
          ...(def.format === 'GROUPS_PLAYOFFS' ? { groupCount: 2, qualifiersPerGroup: 2 } : {}),
          isOnline: true,
          entryFee: 0,
          currency: 'USD',
          tier: def.tier,
          status: 'IN_PROGRESS',
          createdAt: new Date(startsAt.getTime() - 12 * DAY),
        },
      });
      const regByPlayer = new Map<string, number>(); // registrationId → índice (nivel)
      for (const idx of def.players) {
        const p = players[idx];
        const reg = await prisma.tournamentRegistration.create({
          data: {
            tournamentId: t.id,
            playerId: p.playerId,
            requestedById: p.userId,
            status: 'APPROVED',
            feeAmount: 0,
            feeCurrency: 'USD',
            createdAt: new Date(startsAt.getTime() - (8 - (idx % 5)) * DAY),
          },
        });
        regByPlayer.set(reg.id, idx);
      }

      await matches.generate(actor, t.id, { shuffle: true, roundIntervalMinutes: 60 });
      const playPending = async () => {
        for (;;) {
          const pending = await prisma.match.findMany({
            where: { tournamentId: t.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
            orderBy: [{ round: 'asc' }, { position: 'asc' }],
            include: { participants: { orderBy: { slot: 'asc' } } },
          });
          const ready = pending.filter((m) => m.participants.length === 2);
          if (!ready.length) return;
          for (const m of ready) {
            const [a, b] = m.participants.map((p) => regByPlayer.get(p.registrationId)!);
            // Gana más a menudo el de mejor nivel (índice menor), sin que sea seguro
            const pA = 0.5 + Math.max(-0.35, Math.min(0.35, (b - a) * 0.06));
            const [hi, lo] = scoreFor(rand);
            const aWins = rand() < pA;
            await matches.recordResult(actor, m.id, aWins ? { score1: hi, score2: lo } : { score1: lo, score2: hi });
          }
        }
      };
      await playPending();
      if (def.format === 'GROUPS_PLAYOFFS') {
        await matches.generatePlayoffs(actor, t.id);
        await playPending();
      }
      await tournaments.changeStatus(actor, t.id, { status: 'FINISHED' });

      // Fechas coherentes con un torneo ya disputado (el cierre real usa la hora actual)
      const endsAt = new Date(startsAt.getTime() + 6 * 3600e3);
      await prisma.tournament.update({ where: { id: t.id }, data: { endsAt } });
      await prisma.matchResult.updateMany({ where: { match: { tournamentId: t.id } }, data: { createdAt: endsAt } });
      await prisma.rankingEvent.updateMany({ where: { tournamentId: t.id }, data: { createdAt: endsAt } });

      const done = await prisma.tournament.findUniqueOrThrow({
        where: { id: t.id },
        select: { champion: { select: { player: { select: { nickname: true } } } }, _count: { select: { matches: true } } },
      });
      console.log(`✔ ${def.name}: ${done._count.matches} encuentros, campeón ${done.champion?.player?.nickname ?? '—'}`);
    }

    const dota = await createPlayers('dota-2', DOTA);
    const valorant = await createPlayers('valorant', VALORANT);
    console.log(`✔ Organizador ${ORGANIZER.displayName} y ${DOTA.length + VALORANT.length} jugadores creados`);

    // Dota 2: duelos 1v1 en mid (BO3: primero en 2 muertes o la primera torre)
    const bo3 = (rand: () => number): [number, number] => [2, rand() < 0.45 ? 1 : 0];
    // Valorant: duelos 1v1 a 13 rondas
    const to13 = (rand: () => number): [number, number] => [13, Math.floor(rand() * 12)];

    await playTournament(dota.game.id, dota.players, {
      name: 'Copa Andina Dota 2 · Mid 1v1',
      slug: 'copa-andina-dota-2-mid-1v1',
      description: 'Duelos 1v1 en mid con el mismo héroe. Fase de grupos (BO3) y playoffs para los dos mejores de cada grupo.',
      rules: '1. Mismo héroe para ambos jugadores, elegido por sorteo.\n2. Gana quien consiga 2 muertes o la primera torre.\n3. Prohibidas las runas de bounty y la jungla.\n4. Capturas del resultado al terminar cada partida.',
      format: 'GROUPS_PLAYOFFS',
      players: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      startsDaysAgo: 38,
      tier: 2,
    }, bo3, 2026_1);
    await playTournament(dota.game.id, dota.players, {
      name: 'Dota 2 Mid Wars · Noviembre',
      slug: 'dota-2-mid-wars-noviembre',
      description: 'Eliminación directa 1v1 en mid, BO3. Ocho cupos para los mejores del circuito.',
      rules: '1. Héroe libre sin repetir dentro de la serie.\n2. Gana quien consiga 2 muertes o la primera torre.\n3. Pausas de hasta 5 minutos por jugador.',
      format: 'SINGLE_ELIMINATION',
      players: [0, 1, 2, 3, 4, 5, 6, 7],
      startsDaysAgo: 9,
      tier: 1,
    }, bo3, 2026_2);
    await playTournament(valorant.game.id, valorant.players, {
      name: 'Valorant Duelos 1v1 · Copa Andina',
      slug: 'valorant-duelos-1v1-copa-andina',
      description: 'Duelos 1v1 a 13 rondas en mapas personalizados. Fase de grupos y playoffs.',
      rules: '1. Solo Classic y Sheriff en rondas de pistola; Vandal o Phantom en el resto.\n2. Sin habilidades.\n3. Mapas por sorteo: Ascent, Bind o Haven.',
      format: 'GROUPS_PLAYOFFS',
      players: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      startsDaysAgo: 31,
      tier: 2,
    }, to13, 2026_3);
    await playTournament(valorant.game.id, valorant.players, {
      name: 'Valorant Aim Masters 1v1',
      slug: 'valorant-aim-masters-1v1',
      description: 'Eliminación directa 1v1 a 13 rondas para los ocho mejores del ranking.',
      rules: '1. Arsenal libre sin habilidades.\n2. Mapa por sorteo en cada serie.\n3. Reconexión permitida una vez por partida.',
      format: 'SINGLE_ELIMINATION',
      players: [0, 1, 2, 3, 4, 5, 6, 7],
      startsDaysAgo: 5,
      tier: 1,
    }, to13, 2026_4);
    console.log('Listo.');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
