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
export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
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
  groupCount: number | null;
  qualifiersPerGroup: number | null;
  minLevel: CompetitiveLevel | null;
  maxLevel: CompetitiveLevel | null;
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
  viewer: { canManage: boolean; myRegistration: { id: string; status: RegistrationStatus; teamId: string | null } | null } | null;
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

export interface GameProfile {
  id: string;
  platform: Platform;
  gamerTag: string;
  competitiveLevel: CompetitiveLevel;
  playerRole: string | null;
  experienceYears: number | null;
  isPrimary: boolean;
  isFeatured: boolean;
  verificationType: 'SELF_DECLARED' | 'PLATFORM_VERIFIED' | 'EXTERNAL_VERIFIED';
  verifiedAt: string | null;
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
  gameProfiles: GameProfile[];
  _count: { teams: number };
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
