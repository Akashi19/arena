/**
 * Datos de prueba de Arena Torneos.
 * Idempotente para el catálogo y los planes (upsert). Los datos demo
 * (usuarios, equipos, torneos) solo se crean si no existe el superadmin.
 *
 * Credenciales demo (SOLO desarrollo): ver README → "Datos de prueba".
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Platform, PlanCode } from '../src/generated/prisma/client.js';
import { refreshPlayerStats } from '../src/players/stats.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DEMO_PASSWORD = 'Arena2026demo';

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const days = (n: number) => new Date(Date.now() + n * 864e5);

async function seedPlans() {
  const plans: {
    code: PlanCode;
    name: string;
    description: string;
    priceMonthly: number;
    priceYearly: number;
    maxActiveTournaments: number | null;
    maxParticipantsPerTournament: number;
    maxAdmins: number;
    trialDays: number;
    sortOrder: number;
    features: string[];
  }[] = [
    {
      code: 'FREE',
      name: 'Free',
      description: 'Para empezar a organizar tus primeras competiciones.',
      priceMonthly: 0,
      priceYearly: 0,
      maxActiveTournaments: 2,
      maxParticipantsPerTournament: 16,
      maxAdmins: 1,
      trialDays: 0,
      sortOrder: 1,
      features: ['BASIC_STATS', 'BASIC_CUSTOMIZATION', 'VERIFICATION', 'REPUTATION'],
    },
    {
      code: 'PRO',
      name: 'Pro',
      description: 'Para organizadores frecuentes que necesitan más capacidad y analítica.',
      priceMonthly: 19,
      priceYearly: 190,
      maxActiveTournaments: 20,
      maxParticipantsPerTournament: 128,
      maxAdmins: 1,
      trialDays: 14,
      sortOrder: 2,
      features: ['BASIC_STATS', 'ADVANCED_STATS', 'BASIC_CUSTOMIZATION', 'FULL_CUSTOMIZATION', 'VERIFICATION', 'REPUTATION', 'EXPORT_REPORTS'],
    },
    {
      code: 'BUSINESS',
      name: 'Business',
      description: 'Ligas, clubes y empresas: múltiples administradores, branding y reportes ejecutivos.',
      priceMonthly: 79,
      priceYearly: 790,
      maxActiveTournaments: null,
      maxParticipantsPerTournament: 512,
      maxAdmins: 10,
      trialDays: 14,
      sortOrder: 3,
      features: [
        'BASIC_STATS',
        'ADVANCED_STATS',
        'BASIC_CUSTOMIZATION',
        'FULL_CUSTOMIZATION',
        'ADVANCED_BRANDING',
        'CUSTOM_DOMAIN',
        'MULTIPLE_ADMINS',
        'EXECUTIVE_REPORTS',
        'AUDIT_LOG',
        'EXPORT_REPORTS',
        'VERIFICATION',
        'REPUTATION',
      ],
    },
  ];
  for (const { features, ...p } of plans) {
    const plan = await prisma.subscriptionPlan.upsert({ where: { code: p.code }, update: p, create: p });
    for (const featureKey of features) {
      await prisma.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey } },
        update: { enabled: true },
        create: { planId: plan.id, featureKey },
      });
    }
  }
}

async function seedCatalog() {
  const sports = [
    { name: 'Fútbol', allowsDraw: true },
    { name: 'Fútbol 7', allowsDraw: true },
    { name: 'Básquetbol', allowsDraw: false },
    { name: 'Vóley', allowsDraw: false },
    { name: 'Tenis', allowsDraw: false },
    { name: 'Tenis de mesa', allowsDraw: false },
  ];
  for (const [i, s] of sports.entries()) {
    await prisma.sport.upsert({
      where: { slug: slug(s.name) },
      update: {},
      create: { ...s, slug: slug(s.name), sortOrder: i },
    });
  }

  const ALL: Platform[] = ['PC', 'PLAYSTATION', 'XBOX'];
  const games: { name: string; category: string; platforms: Platform[]; allowsDraw?: boolean; ranks?: string[] }[] = [
    {
      name: 'EA Sports FC',
      category: 'FOOTBALL',
      platforms: [...ALL, 'NINTENDO'],
      allowsDraw: true,
      ranks: ['División 10', 'División 9', 'División 8', 'División 7', 'División 6', 'División 5', 'División 4', 'División 3', 'División 2', 'División 1', 'Élite'],
    },
    { name: 'eFootball', category: 'FOOTBALL', platforms: [...ALL, 'MOBILE'], allowsDraw: true, ranks: ['División 10', 'División 8', 'División 6', 'División 4', 'División 2', 'División 1'] },
    { name: 'FIFA', category: 'FOOTBALL', platforms: ALL, allowsDraw: true },
    {
      name: 'Dota 2',
      category: 'MOBA',
      platforms: ['PC'],
      ranks: ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'],
    },
    {
      name: 'League of Legends',
      category: 'MOBA',
      platforms: ['PC'],
      ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger'],
    },
    {
      name: 'Counter-Strike',
      category: 'FPS',
      platforms: ['PC'],
      ranks: ['Silver', 'Gold Nova', 'Master Guardian', 'Legendary Eagle', 'Supreme', 'Global Elite'],
    },
    {
      name: 'Valorant',
      category: 'FPS',
      platforms: ['PC', 'PLAYSTATION', 'XBOX'],
      ranks: ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Ascendente', 'Inmortal', 'Radiante'],
    },
    { name: 'Mortal Kombat', category: 'FIGHTING', platforms: [...ALL, 'NINTENDO'] },
  ];
  for (const [i, g] of games.entries()) {
    const game = await prisma.game.upsert({
      where: { slug: slug(g.name) },
      update: {},
      create: { name: g.name, slug: slug(g.name), category: g.category, platforms: g.platforms, allowsDraw: g.allowsDraw ?? false, sortOrder: i },
    });
    for (const [order, rankName] of (g.ranks ?? []).entries()) {
      await prisma.gameRank.upsert({
        where: { gameId_rankName: { gameId: game.id, rankName } },
        update: {},
        create: { gameId: game.id, rankName, rankLevel: order + 1, rankOrder: order + 1 },
      });
    }
    // Reglas de ranking v1 (ejemplo inicial del spec, configurable por SUPERADMIN)
    for (const competitionType of ['INDIVIDUAL', 'TEAM'] as const) {
      await prisma.rankingRule.upsert({
        where: { gameId_competitionType_version: { gameId: game.id, competitionType, version: 1 } },
        update: {},
        create: {
          gameId: game.id,
          competitionType,
          version: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-01-01'),
          minimumMatches: 5,
          scoringConfiguration: {
            win: 25,
            draw: 10,
            loss: 0,
            participation: 5,
            placement: { '1': 100, '2': 60, '3': 40 },
            tierMultiplier: { '1': 1, '2': 1.25, '3': 1.5, '4': 2, '5': 3 },
          },
        },
      });
    }
  }

  const achievements = [
    ['FIRST_TOURNAMENT', 'Primer torneo', 'Disputó su primer torneo oficial'],
    ['FIRST_WIN', 'Primera victoria', 'Ganó su primer encuentro oficial'],
    ['WINS_10', '10 victorias', 'Acumuló 10 victorias oficiales'],
    ['WINS_50', '50 victorias', 'Acumuló 50 victorias oficiales'],
    ['CHAMPION', 'Campeón', 'Ganó un torneo'],
    ['THREE_IN_A_ROW', 'Tres consecutivos', 'Ganó tres torneos consecutivos'],
    ['MVP', 'Jugador destacado', 'Elegido jugador destacado de un torneo'],
  ];
  for (const [code, name, description] of achievements) {
    await prisma.achievement.upsert({ where: { code }, update: {}, create: { code, name, description } });
  }
}

interface DemoUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  city: string;
  role: 'SUPERADMIN' | 'ORGANIZER' | 'PLAYER';
  organizer?: { displayName: string; description: string; type: 'PERSON' | 'CLUB' | 'COMPANY' | 'ACADEMY' | 'TEAM'; verified?: boolean; featured?: boolean; color?: string };
}

async function createUser(u: DemoUser, passwordHash: string) {
  const free = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'FREE' } });
  const user = await prisma.user.create({
    data: {
      email: u.email,
      username: u.username,
      passwordHash,
      role: u.role,
      profile: { create: { firstName: u.firstName, lastName: u.lastName, country: u.country, city: u.city } },
      player: { create: { fullName: `${u.firstName} ${u.lastName}`, nickname: u.username, country: u.country } },
    },
    include: { player: true },
  });
  let organizerId: string | undefined;
  if (u.organizer) {
    const o = await prisma.organizerProfile.create({
      data: {
        userId: user.id,
        displayName: u.organizer.displayName,
        description: u.organizer.description,
        organizerType: u.organizer.type,
        country: u.country,
        city: u.city,
        primaryColor: u.organizer.color,
        isFeatured: u.organizer.featured ?? false,
        verificationStatus: u.organizer.verified ? 'VERIFIED' : 'NOT_REQUESTED',
        verifiedAt: u.organizer.verified ? days(-60) : null,
        socialLinks: { twitch: `https://twitch.tv/${u.username}`, instagram: `https://instagram.com/${u.username}` },
        members: { create: { userId: user.id, role: 'OWNER' } },
        reputation: { create: {} },
      },
    });
    organizerId = o.id;
    await prisma.subscription.create({
      data: {
        organizerId: o.id,
        planId: free.id,
        status: 'ACTIVE',
        currentPeriodStart: days(-90),
        provider: 'MANUAL',
        history: { create: { toPlanId: free.id, toStatus: 'ACTIVE', reason: 'Seed' } },
      },
    });
    if (u.organizer.verified) {
      await prisma.organizerVerification.create({
        data: {
          organizerId: o.id,
          verificationType: u.organizer.type,
          status: 'VERIFIED',
          organizerName: u.organizer.displayName,
          country: u.country,
          city: u.city,
          contactEmail: u.email,
          contactPhone: '+51 999 000 000',
          description: u.organizer.description,
          policyAcceptedAt: days(-70),
          submittedAt: days(-70),
          reviewedAt: days(-60),
          approvedAt: days(-60),
          expiresAt: days(305),
          isOpen: false,
          history: { create: [{ newStatus: 'PENDING', comments: 'Solicitud recibida' }, { previousStatus: 'PENDING', newStatus: 'VERIFIED', comments: 'Seed' }] },
        },
      });
    }
  }
  return { user, playerId: user.player!.id, organizerId };
}

async function seedDemo() {
  if (await prisma.user.findUnique({ where: { username: 'superadmin' } })) {
    console.log('Datos demo ya presentes: se omite la creación.');
    return;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await createUser(
    { username: 'superadmin', email: 'admin@arena.test', firstName: 'Super', lastName: 'Admin', country: 'PE', city: 'Lima', role: 'SUPERADMIN' },
    passwordHash,
  );
  const ligaGamer = await createUser(
    {
      username: 'ligagamer',
      email: 'liga@arena.test',
      firstName: 'Lucía',
      lastName: 'Ramos',
      country: 'PE',
      city: 'Lima',
      role: 'ORGANIZER',
      organizer: { displayName: 'Liga Gamer', description: 'Torneos de EA Sports FC y Valorant cada fin de semana.', type: 'COMPANY', verified: true, featured: true, color: '#22d3ee' },
    },
    passwordHash,
  );
  const clubAndes = await createUser(
    {
      username: 'clubandes',
      email: 'andes@arena.test',
      firstName: 'Mateo',
      lastName: 'Quispe',
      country: 'CL',
      city: 'Santiago',
      role: 'ORGANIZER',
      organizer: { displayName: 'Club Deportivo Andes', description: 'Ligas amateur de fútbol 7 y básquetbol.', type: 'CLUB', featured: true, color: '#a3e635' },
    },
    passwordHash,
  );
  const players: Awaited<ReturnType<typeof createUser>>[] = [];
  const nicks = [
    ['nova', 'Valeria', 'Soto', 'PE', 'Lima'],
    ['kraken', 'Diego', 'Muñoz', 'CL', 'Santiago'],
    ['zeta', 'Andrés', 'López', 'MX', 'Guadalajara'],
    ['luna', 'Camila', 'Rojas', 'CO', 'Bogotá'],
    ['blitz', 'Sebastián', 'Vega', 'AR', 'Córdoba'],
    ['shadow', 'Joaquín', 'Paredes', 'PE', 'Arequipa'],
    ['pixel', 'Renata', 'Castro', 'MX', 'CDMX'],
    ['titan', 'Martín', 'Herrera', 'CL', 'Valparaíso'],
  ] as const;
  for (const [username, firstName, lastName, country, city] of nicks) {
    players.push(
      await createUser({ username, email: `${username}@arena.test`, firstName, lastName, country, city, role: 'PLAYER' }, passwordHash),
    );
  }

  const fc = await prisma.game.findUniqueOrThrow({ where: { slug: 'ea-sports-fc' } });
  const valorant = await prisma.game.findUniqueOrThrow({ where: { slug: 'valorant' } });
  const futbol7 = await prisma.sport.findUniqueOrThrow({ where: { slug: 'futbol-7' } });
  const basket = await prisma.sport.findUniqueOrThrow({ where: { slug: 'basquetbol' } });
  const valRanks = await prisma.gameRank.findMany({ where: { gameId: valorant.id }, orderBy: { rankOrder: 'asc' } });

  // Perfiles gamer
  for (const [i, p] of players.entries()) {
    await prisma.playerGameProfile.create({
      data: {
        playerId: p.playerId,
        gameId: i % 2 === 0 ? fc.id : valorant.id,
        platform: i % 2 === 0 ? 'PLAYSTATION' : 'PC',
        gamerTag: `${p.user.username.toUpperCase()}#${1000 + i}`,
        competitiveLevel: (['INTERMEDIATE', 'ADVANCED', 'EXPERT', 'BEGINNER'] as const)[i % 4],
        gameRankId: i % 2 === 1 ? valRanks[(i * 2) % valRanks.length].id : undefined,
        isPrimary: true,
        playerRole: i % 2 === 1 ? ['Duelista', 'Controlador', 'Iniciador', 'Centinela'][i % 4] : 'Delantero',
      },
    });
  }

  // Equipos (Valorant)
  const teamDefs = [
    { name: 'Andes Esports', tag: 'AND', owner: players[1], members: [players[1], players[3]] },
    { name: 'Pacific Wolves', tag: 'PCW', owner: players[5], members: [players[5], players[7]] },
  ];
  const teams = [];
  for (const def of teamDefs) {
    const team = await prisma.team.create({
      data: {
        name: def.name,
        tag: def.tag,
        slug: slug(def.name),
        ownerId: def.owner.user.id,
        gameId: valorant.id,
        country: def.owner.user.username === 'kraken' ? 'CL' : 'PE',
        captainId: def.owner.playerId,
        recruitmentStatus: 'LOOKING_FOR_PLAYERS',
        members: { create: def.members.map((m) => ({ playerId: m.playerId })) },
      },
    });
    teams.push(team);
  }

  // Torneos
  const t1 = await prisma.tournament.create({
    data: {
      organizerId: ligaGamer.organizerId!,
      competitionId: (await prisma.competition.create({ data: { organizerId: ligaGamer.organizerId!, name: 'Copa Internacional 2026', slug: 'copa-internacional-2026' } })).id,
      name: 'Copa Internacional FC – Fecha 1',
      slug: 'copa-internacional-fc-fecha-1',
      description: 'Eliminación directa 1v1 en EA Sports FC. Partidos a ida, 6 minutos por tiempo.',
      category: 'ESPORT',
      gameId: fc.id,
      platform: 'PLAYSTATION',
      startsAt: days(10),
      registrationDeadline: days(8),
      maxParticipants: 16,
      mode: 'INDIVIDUAL',
      format: 'SINGLE_ELIMINATION',
      isOnline: true,
      entryFee: 10,
      currency: 'PEN',
      rules: '1. Plantillas Ultimate Team no permitidas.\n2. Conexión estable obligatoria.\n3. Capturas del resultado al finalizar.',
      refundPolicy: 'Devolución completa hasta 48 h antes del inicio.',
      isFeatured: true,
    },
  });
  const t2 = await prisma.tournament.create({
    data: {
      organizerId: ligaGamer.organizerId!,
      name: 'Valorant Clash LATAM',
      slug: 'valorant-clash-latam',
      description: 'Torneo 5v5 por equipos, fase de grupos y playoffs.',
      category: 'ESPORT',
      gameId: valorant.id,
      platform: 'PC',
      startsAt: days(20),
      registrationDeadline: days(15),
      maxParticipants: 16,
      mode: 'TEAM',
      format: 'GROUPS_PLAYOFFS',
      groupCount: 4,
      qualifiersPerGroup: 2,
      isOnline: true,
      entryFee: 25,
      currency: 'USD',
      minLevel: 'INTERMEDIATE',
      rules: 'Mapas en rotación competitiva. BO1 en grupos, BO3 en playoffs.',
    },
  });
  await prisma.tournament.create({
    data: {
      organizerId: clubAndes.organizerId!,
      name: 'Liga Fútbol 7 Primavera',
      slug: 'liga-futbol-7-primavera',
      description: 'Liga todos contra todos, sábados por la mañana.',
      category: 'SPORT',
      sportId: futbol7.id,
      startsAt: days(14),
      registrationDeadline: days(10),
      maxParticipants: 10,
      mode: 'TEAM',
      format: 'ROUND_ROBIN',
      isOnline: false,
      location: 'Complejo Deportivo Los Andes, cancha 2',
      country: 'CL',
      city: 'Santiago',
      entryFee: 40000,
      currency: 'CLP',
      rules: 'Reglamento FIFA adaptado a fútbol 7. Tarjeta amarilla: 2 min de exclusión.',
      isFeatured: true,
    },
  });
  await prisma.tournament.create({
    data: {
      organizerId: clubAndes.organizerId!,
      name: '3x3 Street Basket',
      slug: '3x3-street-basket',
      description: 'Eliminación directa, partidos a 21 puntos.',
      category: 'SPORT',
      sportId: basket.id,
      startsAt: days(-30),
      endsAt: days(-30),
      registrationDeadline: days(-35),
      maxParticipants: 8,
      mode: 'TEAM',
      format: 'SINGLE_ELIMINATION',
      isOnline: false,
      location: 'Parque Bustamante',
      country: 'CL',
      city: 'Santiago',
      entryFee: 0,
      currency: 'CLP',
      status: 'FINISHED',
    },
  });

  // Inscripciones demo
  for (const p of players.filter((_, i) => i % 2 === 0)) {
    await prisma.tournamentRegistration.create({
      data: { tournamentId: t1.id, playerId: p.playerId, requestedById: p.user.id, status: 'APPROVED', feeAmount: 10, feeCurrency: 'PEN' },
    });
  }
  await prisma.tournamentRegistration.create({
    data: { tournamentId: t1.id, playerId: players[1].playerId, requestedById: players[1].user.id, status: 'PENDING', feeAmount: 10, feeCurrency: 'PEN' },
  });
  for (const team of teams) {
    await prisma.tournamentRegistration.create({
      data: { tournamentId: t2.id, teamId: team.id, requestedById: team.ownerId, status: 'APPROVED', feeAmount: 25, feeCurrency: 'USD' },
    });
  }
  console.log(`Datos demo creados. Contraseña de todas las cuentas demo: ${DEMO_PASSWORD}`);
}

async function main() {
  await seedPlans();
  await seedCatalog();
  await seedDemo();
  // Estadísticas oficiales y logros (idempotente): rellena los torneos finalizados antes de existir el cálculo
  const players = await prisma.player.findMany({ select: { id: true } });
  await refreshPlayerStats(prisma, players.map((p) => p.id));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
