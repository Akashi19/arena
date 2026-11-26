export type Role = 'SUPERADMIN' | 'ORGANIZER' | 'PLAYER';
export type VerificationStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'EXPIRED';
export type ReputationLevel = 'NEW' | 'INITIAL' | 'GOOD' | 'EXCELLENT' | 'TOP';
export type TournamentStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
export type TournamentMode = 'INDIVIDUAL' | 'TEAM';
export type TournamentFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUPS' | 'GROUPS_PLAYOFFS';
export type Category = 'SPORT' | 'ESPORT';
export type RegistrationStatus = 'PENDING' | 'PAYMENT_PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type CompetitiveLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | 'PROFESSIONAL';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface OrganizerPublic {
  id: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  organizerType: string;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  country: string;
  city: string;
  user: { username: string };
  reputation: {
    averageScore: string;
    totalRatings: number;
    reputationLevel: ReputationLevel;
    completionRate: string;
    lastCalculatedAt: string;
  } | null;
  description?: string | null;
  _count?: { tournaments: number };
}

export interface Discipline {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string | null;
  logoUrl?: string | null;
  platforms?: string[];
}

export interface TournamentCard {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: Category;
  status: TournamentStatus;
  startsAt: string;
  registrationDeadline: string;
  maxParticipants: number;
  mode: TournamentMode;
  format: TournamentFormat;
  isOnline: boolean;
  location: string | null;
  country: string | null;
  city: string | null;
  entryFee: string;
  currency: string;
  prize: string | null;
  collectOnline?: boolean;
  coverUrl: string | null;
  platform: string | null;
  isFeatured: boolean;
  competition: { name: string } | null;
  sport: Discipline | null;
  game: Discipline | null;
  organizer: OrganizerPublic;
  registeredCount: number;
  spotsLeft: number;
  pendingRegistrations?: number;
}

export interface Participant {
  id: string;
  seed: number | null;
  groupLabel: string | null;
  finalPosition: number | null;
  team: { id: string; name: string; slug: string; logoUrl: string | null; country: string | null } | null;
  player: { id: string; nickname: string; avatarUrl: string | null; country: string | null; user: { username: string } | null } | null;
}

export interface TournamentDetail extends TournamentCard {
  rules: string | null;
  refundPolicy: string | null;
  /** Canales oficiales de transmisión del torneo (URLs validadas por la API) */
  streamChannels: { platform: string; url: string }[];
  groupCount: number | null;
  qualifiersPerGroup: number | null;
  minLevel: CompetitiveLevel | null;
  maxLevel: CompetitiveLevel | null;
  minRankId: string | null;
  maxRankId: string | null;
  minRank: { id: string; rankName: string; rankOrder: number } | null;
  maxRank: { id: string; rankName: string; rankOrder: number } | null;
  mvp: { id: string; nickname: string; avatarUrl: string | null; user: { username: string } | null } | null;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  cancelledReason: string | null;
  createdAt: string;
  organizer: OrganizerPublic & { createdAt: string; _count: { tournaments: number } };
  champion: Participant | null;
  registrations: Participant[];
  registrationOpen: boolean;
  organizerHistory: Partial<Record<'FINISHED' | 'CANCELLED', number>>;
  viewer: { canManage: boolean; myRegistration: { id: string; status: RegistrationStatus; teamId: string | null; pendingPaymentId: string | null } | null } | null;
}

export interface Me {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt: string;
  profile: {
    firstName: string;
    lastName: string;
    country: string;
    city: string;
    phone: string | null;
    avatarUrl: string | null;
    bio: string | null;
    privacy: Record<string, boolean>;
  };
  player: { id: string; nickname: string; avatarUrl: string | null } | null;
  organizerProfile: {
    id: string;
    displayName: string;
    logoUrl: string | null;
    verificationStatus: VerificationStatus;
    primaryColor: string | null;
  } | null;
  unreadNotifications: number;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  tag: string | null;
  logoUrl: string | null;
  description: string | null;
  country: string | null;
  ownerId: string;
  gameId: string | null;
  captainId: string | null;
  recruitmentStatus: string;
  sport: { name: string } | null;
  game: { name: string; logoUrl: string | null } | null;
  _count: { members: number; registrations: number };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface OrganizerFull {
  id: string;
  displayName: string;
  legalName: string | null;
  organizerType: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  description: string | null;
  country: string;
  city: string;
  website: string | null;
  socialLinks: Record<string, string>;
}

// ---------------------------------------------------------------------------- Fixture y resultados

export type BracketSide = 'WINNERS' | 'LOSERS' | 'GRAND_FINAL' | 'GROUP' | 'LEAGUE' | 'PLAYOFF';
export type MatchStatus = 'PENDING' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export interface FixtureEntrant {
  id: string;
  seed: number | null;
  groupLabel: string | null;
  finalPosition: number | null;
  team: { id: string; name: string; slug: string; tag: string | null; logoUrl: string | null } | null;
  player: { id: string; nickname: string; avatarUrl: string | null; user: { username: string } | null } | null;
}

export interface FixtureMatch {
  id: string;
  bracket: BracketSide;
  round: number;
  position: number;
  groupLabel: string | null;
  status: MatchStatus;
  scheduledAt: string | null;
  venue: string | null;
  nextMatchId: string | null;
  nextMatchSlot: number | null;
  loserNextMatchId: string | null;
  participants: { slot: number; score: string | null; isWinner: boolean | null; registration: FixtureEntrant }[];
  result: { version: number; isDraw: boolean; winnerRegistrationId: string | null; correctionReason: string | null; createdAt: string } | null;
  stream: FixtureStream | null;
}

// ---------------------------------------------------------------------------- Transmisiones (módulo 23)

export type StreamStatus = 'NOT_CONFIGURED' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type StreamPlatform = 'YOUTUBE' | 'TWITCH' | 'FACEBOOK' | 'TIKTOK' | 'KICK' | 'OTHER';
export type StreamVisibility = 'PUBLIC' | 'PRIVATE';

export interface StreamEmbed {
  provider: 'youtube' | 'twitch' | 'twitch-video' | 'kick' | 'facebook' | 'vimeo';
  id: string;
}

export interface FixtureStream {
  id: string;
  status: StreamStatus;
  platform: StreamPlatform;
  platformName: string;
  visibility: StreamVisibility;
  url: string | null;
  scheduledStartAt: string | null;
}

export interface MatchStreamInfo {
  id: string;
  matchId: string;
  platform: StreamPlatform;
  platformName: string;
  title: string | null;
  description: string | null;
  status: StreamStatus;
  visibility: StreamVisibility;
  isRebroadcast: boolean;
  isActive: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  updatedAt: string;
  url: string | null;
  embed: StreamEmbed | null;
  restricted: boolean;
}

export interface StreamMatchSummary {
  id: string;
  status: MatchStatus;
  scheduledAt: string | null;
  venue: string | null;
  bracket: BracketSide;
  round: number;
  groupLabel: string | null;
  participants: { slot: number; score: string | null; isWinner: boolean | null; registration: FixtureEntrant }[];
}

export interface StreamTournamentSummary {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  mode: 'INDIVIDUAL' | 'TEAM';
  game: { id: string; name: string } | null;
  sport: { id: string; name: string } | null;
  organizer: { displayName: string; user: { username: string } };
}

export interface MatchStreamDetail {
  match: StreamMatchSummary & { result: { version: number; isDraw: boolean } | null };
  tournament: StreamTournamentSummary;
  streamStatus: StreamStatus;
  stream: MatchStreamInfo | null;
  rebroadcasts: MatchStreamInfo[];
  canManage: boolean;
  canViewPrivate: boolean;
}

export type StreamListItem = MatchStreamInfo & { match: StreamMatchSummary; tournament: StreamTournamentSummary };

export interface TournamentStreams {
  items: StreamListItem[];
  counts: { LIVE: number; UPCOMING: number; ENDED: number };
}

export interface StreamHistoryEntry {
  id: string;
  previousUrl: string | null;
  newUrl: string | null;
  previousStatus: StreamStatus | null;
  newStatus: StreamStatus | null;
  modificationReason: string | null;
  createdAt: string;
  modifiedBy: { username: string; name: string };
  stream: { id: string; platform: StreamPlatform; isRebroadcast: boolean; isActive: boolean };
}

export interface NotificationPreference {
  type: string;
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
}

export interface StandingEntry {
  groupLabel: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: string;
  scoreAgainst: string;
  points: number;
  position: number | null;
  registration: FixtureEntrant;
}

export interface Fixture {
  tournament: {
    id: string;
    status: TournamentStatus;
    format: TournamentFormat;
    mode: TournamentMode;
    groupCount: number | null;
    qualifiersPerGroup: number | null;
    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
    championRegistrationId: string | null;
  };
  matches: FixtureMatch[];
  standings: StandingEntry[];
  progress: { total: number; completed: number };
  canGeneratePlayoffs: boolean;
  canManage: boolean;
}

// ---------------------------------------------------------------------------- Jugadores y perfiles gamer

export type Platform = 'PC' | 'PLAYSTATION' | 'XBOX' | 'NINTENDO' | 'MOBILE' | 'CROSSPLAY' | 'NONE';
export type RecruitmentStatus = 'NOT_LOOKING' | 'LOOKING_FOR_TEAM' | 'LOOKING_FOR_PLAYERS';

export type LevelVerificationType = 'SELF_DECLARED' | 'PLATFORM_VERIFIED' | 'EXTERNAL_VERIFIED';

export interface GameProfile {
  id: string;
  platform: Platform;
  gamerTag: string;
  competitiveLevel: CompetitiveLevel;
  playerRole: string | null;
  experienceYears: number | null;
  isPrimary: boolean;
  isFeatured: boolean;
  isFavorite: boolean;
  displayOrder: number;
  verificationType: LevelVerificationType;
  verificationSource: string | null;
  verifiedAt: string | null;
  joinedAt: string;
  lastUpdatedAt: string;
  game: { id: string; name: string; slug: string; logoUrl: string | null };
  rank: { id: string; rankName: string; rankOrder: number; iconUrl: string | null } | null;
}

export interface PlayerCard {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  country: string | null;
  recruitmentStatus: RecruitmentStatus;
  availability: string | null;
  gameProfiles: GameProfile[];
  currentTeam: { name: string; slug: string; tag: string | null; logoUrl: string | null } | null;
}

export interface LevelHistoryEntry {
  recordedAt: string;
  newLevel: CompetitiveLevel | null;
  newRank: string | null;
  source: LevelVerificationType;
}

export interface PlayerComparison {
  game: { id: string; name: string; slug: string; logoUrl: string | null; hasRanks: boolean };
  players: {
    username: string;
    nickname: string;
    avatarUrl: string | null;
    country: string | null;
    profile: GameProfile | null;
    stats: { matchesPlayed: number; wins: number; losses: number; draws: number; winRate: number; tournamentsPlayed: number; tournamentsWon: number } | null;
    evolution: LevelHistoryEntry[] | null;
    results: { finalPosition: number | null; participants: number; tournament: { name: string; slug: string; startsAt: string } }[] | null;
  }[];
  leaders: Partial<Record<'level' | 'rank' | 'matchesPlayed' | 'wins' | 'winRate' | 'tournamentsWon', string[]>>;
}

export interface LevelThreshold {
  level: CompetitiveLevel;
  matches: number;
  winRate: number;
  titles: number;
}

export interface TeamInvitation {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  player: { id: string; nickname: string; avatarUrl: string | null; user: { username: string } | null };
}

export interface MyInvitation {
  id: string;
  message: string | null;
  createdAt: string;
  sentBy: { username: string };
  team: {
    id: string;
    name: string;
    slug: string;
    tag: string | null;
    logoUrl: string | null;
    country: string | null;
    game: { name: string } | null;
    sport: { name: string } | null;
    _count: { members: number };
  };
}

export interface StatLine {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  podiums: number;
  winRate: number;
}

export interface PlayerProfile {
  id: string;
  username: string;
  nickname: string;
  fullName: string | null;
  avatarUrl: string | null;
  country: string | null;
  city: string | null;
  bio: string | null;
  position: string | null;
  jerseyNumber: number | null;
  recruitmentStatus: RecruitmentStatus;
  availability: string | null;
  isSuspended: boolean;
  memberSince: string;
  organizer: { displayName: string; verificationStatus: VerificationStatus } | null;
  gameProfiles: GameProfile[];
  teams:
    | {
        role: string | null;
        jerseyNumber: number | null;
        joinedAt: string;
        leftAt: string | null;
        isCaptain: boolean;
        team: { id: string; name: string; slug: string; tag: string | null; logoUrl: string | null; game: { name: string } | null; sport: { name: string } | null };
      }[]
    | null;
  achievements: { unlockedAt: string; achievement: { code: string; name: string; description: string; iconUrl: string | null } }[];
  stats: {
    overall: StatLine;
    byDiscipline: (StatLine & { key: string; label: string; game: { id: string; name: string; slug: string; logoUrl: string | null } | null })[];
  } | null;
  history:
    | {
        finalPosition: number | null;
        participants: number;
        team: { name: string; slug: string; logoUrl: string | null } | null;
        tournament: {
          name: string;
          slug: string;
          status: TournamentStatus;
          startsAt: string;
          category: Category;
          format: TournamentFormat;
          game: { name: string; logoUrl: string | null } | null;
          sport: { name: string } | null;
          organizer: { displayName: string };
        };
      }[]
    | null;
  isOwner: boolean;
}

export interface MyPlayer {
  id: string;
  nickname: string;
  recruitmentStatus: RecruitmentStatus;
  position: string | null;
  availability: string | null;
  jerseyNumber: number | null;
  gameProfiles: GameProfile[];
}

// ---------------------------------------------------------------------------- Confianza: verificación, valoraciones, incidencias

export type OrganizerType = 'PERSON' | 'TEAM' | 'CLUB' | 'ACADEMY' | 'COMPANY';
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'HIDDEN' | 'SUSPENDED';
export type IncidentType =
  | 'SCHEDULE_BREACH'
  | 'UNANNOUNCED_CHANGES'
  | 'ORGANIZATION_ISSUES'
  | 'RULES_BREACH'
  | 'REGISTRATION_ISSUES'
  | 'UNJUSTIFIED_CANCELLATION'
  | 'OTHER';
export type IncidentStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface VerificationRequest {
  id: string;
  status: VerificationStatus;
  verificationType: OrganizerType;
  organizerName: string;
  submittedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  infoRequested: string | null;
  isOpen: boolean;
  documents: { id: string; documentType: string; originalName: string | null; uploadedAt: string; reviewStatus: string }[];
  history: { previousStatus: VerificationStatus | null; newStatus: VerificationStatus; reason: string | null; createdAt: string }[];
}

export interface MyVerification {
  status: VerificationStatus;
  verifiedAt: string | null;
  current: VerificationRequest | null;
  previous: VerificationRequest[];
  canRequest: boolean;
  prefill: {
    organizerName: string;
    legalName: string | null;
    verificationType: OrganizerType;
    country: string;
    city: string;
    contactEmail: string;
    contactPhone: string;
    description: string;
    website: string;
    socialLinks: Record<string, string>;
    logoUrl: string | null;
  };
}

export interface Reputation {
  averageScore: string;
  totalRatings: number;
  organizationAverage: string;
  punctualityAverage: string;
  communicationAverage: string;
  transparencyAverage: string;
  experienceAverage: string;
  completedTournaments: number;
  cancelledTournaments: number;
  dueTournaments: number;
  completionRate: string;
  confirmedIncidents: number;
  reputationLevel: ReputationLevel;
  lastCalculatedAt: string;
}

export interface RatingItem {
  id: string;
  organizationScore: number;
  punctualityScore: number;
  communicationScore: number;
  transparencyScore: number;
  overallExperienceScore: number;
  finalScore: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  tournament: { name: string; slug: string };
  author: { nickname: string; username: string; avatarUrl: string | null };
  response: { response: string; createdAt: string; updatedAt: string; editableUntil?: string } | null;
}

export interface ConfirmedIncident {
  id: string;
  incidentType: IncidentType;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  tournament: { name: string; slug: string };
}

export interface ReputationSummary {
  reputation: Reputation;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  monthly: { month: string; average: number | null; count: number }[];
  confirmedIncidents: ConfirmedIncident[];
  smallSample: boolean;
}

export interface MyReputation extends ReputationSummary {
  organizerId: string;
  pendingResponses: number;
  openIncidents: number;
  recent: RatingItem[];
}

export interface TournamentFeedback {
  canRate: boolean;
  canEdit: boolean;
  reason: string | null;
  rating: (Omit<RatingItem, 'author'> & { editableUntil: string; moderationStatus: ModerationStatus }) | null;
  canReportIncident: boolean;
  incidents: { id: string; incidentType: IncidentType; status: IncidentStatus; createdAt: string; resolution: string | null }[];
}

// ============================================================================ Rankings (módulo 22)

export type RankingType = 'PLAYER' | 'TEAM';
export type SeasonStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type RuleStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type TrendStatus = 'UP' | 'DOWN' | 'SAME' | 'NEW';

export interface RankingParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
  country: string | null;
  username: string | null;
  slug: string | null;
  tag: string | null;
}

export interface RankingRowData {
  participantId: string;
  countryCode: string | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  isProvisional: boolean;
  positionGlobal: number | null;
  positionCountry: number | null;
  lastCalculatedAt: string;
}

export interface RankingSeason {
  id: string;
  name: string;
  description: string | null;
  gameId: string;
  countryCode: string | null;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  minimumMatches: number;
  scoringRulesVersion: number;
  championPlayerId: string | null;
  championTeamId: string | null;
  champions?: { player: RankingParticipant | null; team: RankingParticipant | null };
  game?: { id: string; name: string; slug?: string };
}

export interface RankingTableRow extends RankingRowData {
  position: number | null;
  participant: RankingParticipant | null;
  trend: { status: TrendStatus; delta: number } | null;
}

export interface RankingTable extends Paginated<RankingTableRow> {
  game: { id: string; name: string; slug: string; logoUrl: string | null };
  type: RankingType;
  country: string | null;
  season: RankingSeason | null;
  minimumMatches: number;
  updatedAt: string | null;
  provisional: RankingTableRow[];
}

export interface RankingEventItem {
  id: string;
  eventType: string;
  pointsAwarded: number;
  placement: number | null;
  isReverted: boolean;
  revertReason: string | null;
  matchId: string | null;
  createdAt: string;
  game: { id: string; name: string };
  tournament: { id: string; name: string; slug: string; endsAt: string | null } | null;
}

export interface CompetitiveGame {
  game: { id: string; name: string; slug: string; logoUrl: string | null };
  historic: (RankingRowData & { gameId: string; seasonId: null }) | null;
  trend: { status: TrendStatus; delta: number } | null;
  currentSeason: { season: RankingSeason; row: RankingRowData; isChampion: boolean } | null;
  seasons: { season: RankingSeason; row: RankingRowData; isChampion: boolean }[];
}

export interface CompetitiveProfile {
  games: CompetitiveGame[];
  events: RankingEventItem[];
}

export interface RankingHistory {
  snapshots: { date: string; points: number; position: number }[];
  weekly: { week: string; points: number; position: number }[];
  seasons: { season: { id: string; name: string; status: SeasonStatus; countryCode: string | null }; position: number | null; points: number; isProvisional: boolean }[];
}

export interface RankingComparison {
  game: { id: string; name: string };
  type: RankingType;
  seasonId: string | null;
  items: { participant: RankingParticipant; row: RankingRowData | null; history: RankingHistory['weekly'] }[];
  leaders: Record<string, string[]>;
}

export interface ResultReport {
  id: string;
  matchId: string;
  reason: string;
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  resolution: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

// ============================================================================ Suscripciones (módulo 17)

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type BillingPeriod = 'MONTHLY' | 'YEARLY';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type PaymentProvider = 'STRIPE' | 'MERCADOPAGO' | 'SANDBOX' | 'MANUAL';

export interface SubscriptionSummary {
  plan: { code: string; name: string; description: string | null; priceMonthly: string; priceYearly: string; currency: string; features: string[] };
  subscription: {
    id: string;
    status: SubscriptionStatus;
    billingPeriod: BillingPeriod;
    startedAt: string;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: string | null;
    graceUntil: string | null;
    provider: PaymentProvider | null;
    isFree: boolean;
    plan: { code: string; name: string; priceMonthly: string; priceYearly: string; currency: string };
    pendingPlan: { code: string; name: string } | null;
    pendingBillingPeriod: BillingPeriod | null;
  } | null;
  usage: {
    activeTournaments: { used: number; limit: number | null };
    participantsPerTournament: { used: number; limit: number };
    admins: { used: number; limit: number };
  };
  trialAvailable: boolean;
  pendingPayment: {
    id: string;
    amount: string;
    currency: string;
    provider: PaymentProvider;
    checkoutUrl: string | null;
    createdAt: string;
    kind: 'NEW' | 'UPGRADE' | 'RENEWAL';
    billingPeriod: BillingPeriod;
    plan: { code: string; name: string };
  } | null;
  providers: { code: PaymentProvider; name: string }[];
}

export interface SubscriptionQuote {
  change: 'CURRENT' | 'IMMEDIATE' | 'SCHEDULED' | 'TO_FREE';
  kind: 'NEW' | 'UPGRADE' | 'RENEWAL';
  plan: { id: string; code: string; name: string };
  currentPlan: { code: string; name: string };
  billingPeriod: BillingPeriod;
  currency: string;
  listAmount: number;
  discountAmount: number;
  creditAmount: number;
  amount: number;
  effectiveAt: string | null;
  periodEnd: string | null;
  message: string;
}

export interface SubscriptionPayment {
  id: string;
  status: PaymentStatus;
  kind: 'NEW' | 'UPGRADE' | 'RENEWAL';
  provider: PaymentProvider;
  billingPeriod: BillingPeriod;
  listAmount: string;
  discountAmount: string;
  creditAmount: string;
  amount: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  failureReason: string | null;
  checkoutUrl: string | null;
  createdAt: string;
  plan: { code: string; name: string };
  promoCode: { code: string } | null;
  invoice: { id: string; number: string } | null;
  sandboxAvailable?: boolean;
}

export interface SubscriptionHistoryEntry {
  id: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  reason: string | null;
  createdAt: string;
  fromPlan: { code: string; name: string } | null;
  toPlan: { code: string; name: string } | null;
  changedBy: { username: string; role: string } | null;
}

export interface SubscriptionInvoice {
  id: string;
  number: string;
  amount: string;
  currency: string;
  issuedAt: string;
  providerUrl: string | null;
  payment: SubscriptionPayment | null;
  subscription: { organizer: { id: string; displayName: string; country: string | null; city: string | null; user: { email: string } } };
}

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  maxActiveTournaments: number | null;
  maxParticipantsPerTournament: number;
  maxAdmins: number;
  trialDays: number;
  graceDays: number;
  registrationFeePercent: string;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
  features: { featureKey: string; enabled: boolean }[];
  _count: { subscriptions: number };
}

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOff: string | null;
  appliesToPlans: string[];
  validFrom: string;
  validUntil: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  isActive: boolean;
  createdAt: string;
}

export interface AdminSubscription {
  id: string;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  startedAt: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  isCurrent: boolean;
  provider: PaymentProvider | null;
  plan: { code: string; name: string; currency: string };
  pendingPlan: { code: string; name: string } | null;
  promoCode: { code: string } | null;
  organizer: { id: string; displayName: string; user: { username: string; email: string } };
  payments: { amount: string; currency: string; paidAt: string }[];
}

export type AdminPayment = SubscriptionPayment & { subscription: { organizer: { displayName: string; user: { username: string } } } };

export interface BillingMetrics {
  generatedAt: string;
  organizers: number;
  subscribers: number;
  paying: number;
  byPlan: { code: string; name: string; total: number; active: number; trial: number; pastDue: number }[];
  revenue: { currency: string; mrr: number; arr: number; arpu: number; month: number; year: number; series: { month: string; total: number }[] }[];
  churn: { last30Days: number; rate: number };
  conversion: { freeToPro: { count: number; base: number; rate: number }; proToBusiness: { count: number; base: number; rate: number } };
  pendingPayments: number;
  pastDue: number;
  scheduledCancels: number;
}

// ---------------------------------------------------------------------------------------------
// Fase 6: estadísticas avanzadas, reporte ejecutivo y estadísticas globales
// ---------------------------------------------------------------------------------------------

export interface StatsSummary {
  tournamentsCreated: number;
  tournamentsStarted: number;
  tournamentsFinished: number;
  tournamentsCancelled: number;
  registrations: number;
  registrationsApproved: number;
  registrationsRejected: number;
  registrationsPending: number;
  registrationsWithdrawn: number;
  approvalRate: number | null;
  capacity: number;
  occupancyRate: number | null;
  matchesPlayed: number;
  drawRate: number | null;
  activeParticipants: number;
  newParticipants: number;
  returningParticipants: number;
  retentionRate: number | null;
}

export interface StatsOverview {
  range: { months: number; from: string; to: string; periodEnd: string; previousFrom: string; previousTo: string };
  summary: StatsSummary;
  previous: StatsSummary;
  changes: Record<keyof StatsSummary, number | null>;
  monthly: { month: string; tournaments: number; registrations: number; approved: number; matches: number }[];
  byDiscipline: { name: string; category: 'SPORT' | 'ESPORT'; tournaments: number; participants: number; occupancyRate: number | null }[];
  byFormat: { format: TournamentFormat; mode: 'INDIVIDUAL' | 'TEAM'; tournaments: number }[];
  top: { kind: 'TEAM' | 'PLAYER'; id: string; name: string; slug: string | null; played: number; wins: number; titles: number; winRate: number | null }[];
}

export interface StatsTournamentRow {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  format: TournamentFormat;
  startsAt: string;
  maxParticipants: number;
  approved: number;
  pending: number;
  occupancyRate: number | null;
  matchesTotal: number;
  matchesCompleted: number;
  progress: number | null;
}

export interface OrganizerStats extends StatsOverview {
  tournaments: StatsTournamentRow[];
  features: { export: boolean; executiveReport: boolean };
}

export interface ExecutiveReport extends StatsOverview {
  generatedAt: string;
  organizer: { displayName: string; logoUrl: string | null; verificationStatus: VerificationStatus };
  plan: string;
  reputation: { level: ReputationLevel; averageScore: string; totalRatings: number; ratingsInPeriod: number } | null;
  tournaments: StatsTournamentRow[];
}

export interface PlatformStats extends StatsOverview {
  users: {
    total: number;
    byRole: Record<string, number>;
    suspended: number;
    activeLast30Days: number;
    signups: { month: string; users: number; organizers: number }[];
  };
  organizersByVerification: Record<string, number>;
  tournamentsByStatus: Partial<Record<TournamentStatus, number>>;
  tournamentsByCategory: Partial<Record<'SPORT' | 'ESPORT', number>>;
  topOrganizers: { id: string; displayName: string; username: string; tournaments: number; participants: number; matchesPlayed: number }[];
}

// ---------------------------------------------------------------------------------------------
// Cobro de inscripciones en línea (Mercado Pago del organizador)
// ---------------------------------------------------------------------------------------------

export type RegistrationPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export interface PaymentAccountInfo {
  account: {
    id: string;
    provider: 'MERCADOPAGO' | 'SANDBOX';
    status: 'CONNECTED' | 'NEEDS_RECONNECT' | 'DISCONNECTED';
    externalUserId: string | null;
    liveMode: boolean;
    connectedAt: string;
    tokenExpiresAt: string | null;
    lastError: string | null;
  } | null;
  canCollect: boolean;
  providers: { mercadopago: boolean; sandbox: boolean };
  feePercent: number;
  plan: string;
  holdMinutes: number;
}

export interface RegistrationPaymentView {
  id: string;
  status: RegistrationPaymentStatus;
  provider: 'MERCADOPAGO' | 'SANDBOX';
  amount: number;
  currency: string;
  feePercent: number;
  platformFee: number;
  checkoutUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  failureReason: string | null;
  createdAt: string;
  participant: string | null;
  expired: boolean;
  sandbox?: boolean;
  tournament: { id: string; name: string; slug: string; status: TournamentStatus };
  registration: { id: string; status: RegistrationStatus };
  payer: { username: string };
  organizer?: { displayName: string };
}

export interface RegistrationPaymentList extends Paginated<RegistrationPaymentView> {
  totals: { currency: string; payments: number; gross: number; fee: number; net: number }[];
}
