-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'ORGANIZER', 'PLAYER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DisciplineCategory" AS ENUM ('SPORT', 'ESPORT');

-- CreateEnum
CREATE TYPE "TournamentMode" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUPS', 'GROUPS_PLAYOFFS');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BracketSide" AS ENUM ('WINNERS', 'LOSERS', 'GRAND_FINAL', 'GROUP', 'LEAGUE', 'PLAYOFF');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DECLARED', 'VALIDATED', 'DISPUTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrganizerType" AS ENUM ('PERSON', 'TEAM', 'CLUB', 'ACADEMY', 'COMPANY');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('PC', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'MOBILE', 'CROSSPLAY', 'NONE');

-- CreateEnum
CREATE TYPE "RecruitmentStatus" AS ENUM ('NOT_LOOKING', 'LOOKING_FOR_TEAM', 'LOOKING_FOR_PLAYERS');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MERCADOPAGO', 'MANUAL');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReputationLevel" AS ENUM ('NEW', 'INITIAL', 'GOOD', 'EXCELLENT', 'TOP');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('SCHEDULE_BREACH', 'UNANNOUNCED_CHANGES', 'ORGANIZATION_ISSUES', 'RULES_BREACH', 'REGISTRATION_ISSUES', 'UNJUSTIFIED_CANCELLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CompetitiveLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "LevelVerificationType" AS ENUM ('SELF_DECLARED', 'PLATFORM_VERIFIED', 'EXTERNAL_VERIFIED');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RankingType" AS ENUM ('PLAYER', 'TEAM');

-- CreateEnum
CREATE TYPE "RankingEventType" AS ENUM ('MATCH_WIN', 'MATCH_DRAW', 'MATCH_LOSS', 'MATCH_PARTICIPATION', 'TOURNAMENT_PLACEMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StreamPlatform" AS ENUM ('YOUTUBE', 'TWITCH', 'FACEBOOK', 'TIKTOK', 'KICK', 'OTHER');

-- CreateEnum
CREATE TYPE "StreamStatus" AS ENUM ('NOT_CONFIGURED', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_url" TEXT,
    "bio" TEXT,
    "privacy" JSONB NOT NULL DEFAULT '{"showRealName":true,"showCountry":true,"showStats":true,"showTeams":true,"showHistory":true}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "organizer_type" "OrganizerType" NOT NULL DEFAULT 'PERSON',
    "logo_url" TEXT,
    "banner_url" TEXT,
    "primary_color" TEXT,
    "description" TEXT,
    "country" CHAR(2) NOT NULL,
    "city" TEXT NOT NULL,
    "website" TEXT,
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "custom_domain" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "verified_at" TIMESTAMP(3),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_members" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "allows_draw" BOOLEAN NOT NULL DEFAULT true,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "platforms" "Platform"[],
    "allows_draw" BOOLEAN NOT NULL DEFAULT false,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_ranks" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "rank_name" TEXT NOT NULL,
    "rank_level" INTEGER NOT NULL,
    "rank_order" INTEGER NOT NULL,
    "icon_url" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "game_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "competition_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" "DisciplineCategory" NOT NULL,
    "sport_id" UUID,
    "game_id" UUID,
    "platform" "Platform",
    "cover_url" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "registration_deadline" TIMESTAMP(3) NOT NULL,
    "max_participants" INTEGER NOT NULL,
    "mode" "TournamentMode" NOT NULL,
    "format" "TournamentFormat" NOT NULL,
    "group_count" INTEGER,
    "qualifiers_per_group" INTEGER,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "country" CHAR(2),
    "city" TEXT,
    "status" "TournamentStatus" NOT NULL DEFAULT 'OPEN',
    "entry_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "rules" TEXT,
    "refund_policy" TEXT,
    "min_level" "CompetitiveLevel",
    "max_level" "CompetitiveLevel",
    "min_rank_id" UUID,
    "max_rank_id" UUID,
    "points_win" INTEGER NOT NULL DEFAULT 3,
    "points_draw" INTEGER NOT NULL DEFAULT 1,
    "points_loss" INTEGER NOT NULL DEFAULT 0,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "is_ranked" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_reason" TEXT,
    "cancellation_justified" BOOLEAN,
    "champion_registration_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tag" VARCHAR(6),
    "logo_url" TEXT,
    "description" TEXT,
    "country" CHAR(2),
    "sport_id" UUID,
    "game_id" UUID,
    "captain_id" UUID,
    "recruitment_status" "RecruitmentStatus" NOT NULL DEFAULT 'NOT_LOOKING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_identity_history" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_identity_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "manager_id" UUID,
    "full_name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar_url" TEXT,
    "country" CHAR(2),
    "jersey_number" INTEGER,
    "position" TEXT,
    "recruitment_status" "RecruitmentStatus" NOT NULL DEFAULT 'NOT_LOOKING',
    "availability" TEXT,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_players" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "role" TEXT,
    "jersey_number" INTEGER,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "team_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "message" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_registrations" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "team_id" UUID,
    "player_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "seed" INTEGER,
    "group_label" TEXT,
    "fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fee_currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "participation_validated" BOOLEAN NOT NULL DEFAULT false,
    "final_position" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "bracket" "BracketSide" NOT NULL,
    "group_label" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMP(3),
    "venue" TEXT,
    "next_match_id" UUID,
    "next_match_slot" INTEGER,
    "loser_next_match_id" UUID,
    "loser_next_slot" INTEGER,
    "is_manually_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_participants" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "score" DECIMAL(10,2),
    "is_winner" BOOLEAN,

    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "scores" JSONB NOT NULL,
    "winner_registration_id" UUID,
    "is_draw" BOOLEAN NOT NULL DEFAULT false,
    "individual_stats" JSONB,
    "status" "ResultStatus" NOT NULL DEFAULT 'VALIDATED',
    "confirmed_by_id" UUID NOT NULL,
    "correction_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_schedules" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "previous_at" TIMESTAMP(3),
    "reason" TEXT,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_lineups" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,

    CONSTRAINT "match_lineups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_standings" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "group_label" TEXT NOT NULL DEFAULT '',
    "played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "score_for" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "score_against" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "data" JSONB,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(12,2) NOT NULL,
    "price_yearly" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "max_active_tournaments" INTEGER,
    "max_participants_per_tournament" INTEGER NOT NULL,
    "max_admins" INTEGER NOT NULL,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "grace_days" INTEGER NOT NULL DEFAULT 7,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limit_value" INTEGER,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "billing_period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "grace_until" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "promo_code_id" UUID,
    "provider" "PaymentProvider",
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL,
    "provider_payment_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "payment_id" UUID,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider_url" TEXT,
    "pdf_path" TEXT,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_history" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "from_plan_id" UUID,
    "to_plan_id" UUID,
    "from_status" "SubscriptionStatus",
    "to_status" "SubscriptionStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_usage" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotional_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percent_off" INTEGER,
    "amount_off" DECIMAL(12,2),
    "applies_to_plans" "PlanCode"[],
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "max_redemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotional_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_verifications" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "verification_type" "OrganizerType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "organizer_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "country" CHAR(2) NOT NULL,
    "city" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "website" TEXT,
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "logo_url" TEXT,
    "policy_accepted_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "reviewed_by" UUID,
    "rejection_reason" TEXT,
    "admin_notes" TEXT,
    "info_requested" TEXT,
    "is_open" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "organizer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "verification_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "original_name" TEXT,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_status" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "delete_after" TIMESTAMP(3),

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_history" (
    "id" UUID NOT NULL,
    "verification_id" UUID NOT NULL,
    "previous_status" "VerificationStatus",
    "new_status" "VerificationStatus" NOT NULL,
    "changed_by" UUID,
    "reason" TEXT,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_ratings" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "organization_score" INTEGER NOT NULL,
    "punctuality_score" INTEGER NOT NULL,
    "communication_score" INTEGER NOT NULL,
    "transparency_score" INTEGER NOT NULL,
    "overall_experience_score" INTEGER NOT NULL,
    "final_score" DECIMAL(3,2) NOT NULL,
    "comment" TEXT,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "is_suspicious" BOOLEAN NOT NULL DEFAULT false,
    "editable_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_responses" (
    "id" UUID NOT NULL,
    "rating_id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "response" TEXT NOT NULL,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "editable_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_reputation" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "average_score" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_ratings" INTEGER NOT NULL DEFAULT 0,
    "organization_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "punctuality_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "communication_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "transparency_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "experience_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "completed_tournaments" INTEGER NOT NULL DEFAULT 0,
    "cancelled_tournaments" INTEGER NOT NULL DEFAULT 0,
    "due_tournaments" INTEGER NOT NULL DEFAULT 0,
    "completion_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "confirmed_incidents" INTEGER NOT NULL DEFAULT 0,
    "reputation_level" "ReputationLevel" NOT NULL DEFAULT 'NEW',
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_reputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_incidents" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "incident_type" "IncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_path" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "reviewed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "organizer_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_history" (
    "id" UUID NOT NULL,
    "rating_id" UUID NOT NULL,
    "previous_values" JSONB NOT NULL,
    "new_values" JSONB NOT NULL,
    "changed_by" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_reports" (
    "id" UUID NOT NULL,
    "rating_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_game_profiles" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "gamer_tag" TEXT NOT NULL,
    "competitive_level" "CompetitiveLevel" NOT NULL DEFAULT 'BEGINNER',
    "game_rank_id" UUID,
    "player_role" TEXT,
    "experience_years" INTEGER,
    "is_featured" BOOLEAN NOT NULL DEFAULT true,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "verification_type" "LevelVerificationType" NOT NULL DEFAULT 'SELF_DECLARED',
    "verification_source" TEXT,
    "verified_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "player_game_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_game_statistics" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "tournaments_played" INTEGER NOT NULL DEFAULT 0,
    "tournaments_won" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_game_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_achievements" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "game_id" UUID,
    "achievement_id" UUID NOT NULL,
    "source_ref" TEXT,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_game_history" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "previous_rank" TEXT,
    "new_rank" TEXT,
    "previous_level" "CompetitiveLevel",
    "new_level" "CompetitiveLevel",
    "source" "LevelVerificationType" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_game_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "game_id" UUID NOT NULL,
    "country_code" CHAR(2),
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "scoring_rules_version" INTEGER NOT NULL,
    "minimum_matches" INTEGER NOT NULL DEFAULT 5,
    "champion_player_id" UUID,
    "champion_team_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_rules" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "competition_type" "TournamentMode" NOT NULL,
    "scoring_configuration" JSONB NOT NULL,
    "minimum_matches" INTEGER NOT NULL DEFAULT 5,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_rankings" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "season_id" UUID,
    "country_code" CHAR(2),
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "tournaments_played" INTEGER NOT NULL DEFAULT 0,
    "tournaments_won" INTEGER NOT NULL DEFAULT 0,
    "is_provisional" BOOLEAN NOT NULL DEFAULT true,
    "position_global" INTEGER,
    "position_country" INTEGER,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_rankings" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "season_id" UUID,
    "country_code" CHAR(2),
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "tournaments_played" INTEGER NOT NULL DEFAULT 0,
    "tournaments_won" INTEGER NOT NULL DEFAULT 0,
    "is_provisional" BOOLEAN NOT NULL DEFAULT true,
    "position_global" INTEGER,
    "position_country" INTEGER,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_snapshots" (
    "id" UUID NOT NULL,
    "ranking_type" "RankingType" NOT NULL,
    "participant_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "season_id" UUID,
    "country_code" CHAR(2),
    "points" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "snapshot_date" DATE NOT NULL,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_events" (
    "id" UUID NOT NULL,
    "event_type" "RankingEventType" NOT NULL,
    "ranking_type" "RankingType" NOT NULL,
    "participant_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "tournament_id" UUID,
    "match_id" UUID,
    "points_awarded" INTEGER NOT NULL,
    "scoring_rules_version" INTEGER NOT NULL,
    "event_reference" TEXT NOT NULL,
    "is_reverted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_audit_logs" (
    "id" UUID NOT NULL,
    "administrator_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_streams" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "stream_url" TEXT NOT NULL,
    "stream_platform" "StreamPlatform" NOT NULL,
    "stream_title" TEXT,
    "stream_description" TEXT,
    "stream_status" "StreamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "stream_visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "is_rebroadcast" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "scheduled_start_at" TIMESTAMP(3),
    "scheduled_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_stream_history" (
    "id" UUID NOT NULL,
    "match_stream_id" UUID NOT NULL,
    "previous_url" TEXT,
    "new_url" TEXT,
    "previous_status" "StreamStatus",
    "new_status" "StreamStatus",
    "modified_by" UUID NOT NULL,
    "modification_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_stream_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "user_profiles_country_city_idx" ON "user_profiles"("country", "city");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_profiles_user_id_key" ON "organizer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_profiles_custom_domain_key" ON "organizer_profiles"("custom_domain");

-- CreateIndex
CREATE INDEX "organizer_profiles_verification_status_idx" ON "organizer_profiles"("verification_status");

-- CreateIndex
CREATE INDEX "organizer_profiles_country_city_idx" ON "organizer_profiles"("country", "city");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_members_organizer_id_user_id_key" ON "organizer_members"("organizer_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_name_key" ON "sports"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sports_slug_key" ON "sports"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "games_name_key" ON "games"("name");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "game_ranks_game_id_rank_name_key" ON "game_ranks"("game_id", "rank_name");

-- CreateIndex
CREATE UNIQUE INDEX "game_ranks_game_id_rank_order_key" ON "game_ranks"("game_id", "rank_order");

-- CreateIndex
CREATE UNIQUE INDEX "competitions_organizer_id_slug_key" ON "competitions"("organizer_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_champion_registration_id_key" ON "tournaments"("champion_registration_id");

-- CreateIndex
CREATE INDEX "tournaments_status_starts_at_idx" ON "tournaments"("status", "starts_at");

-- CreateIndex
CREATE INDEX "tournaments_organizer_id_status_idx" ON "tournaments"("organizer_id", "status");

-- CreateIndex
CREATE INDEX "tournaments_category_sport_id_idx" ON "tournaments"("category", "sport_id");

-- CreateIndex
CREATE INDEX "tournaments_category_game_id_idx" ON "tournaments"("category", "game_id");

-- CreateIndex
CREATE INDEX "tournaments_country_city_idx" ON "tournaments"("country", "city");

-- CreateIndex
CREATE INDEX "tournaments_entry_fee_idx" ON "tournaments"("entry_fee");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE INDEX "teams_owner_id_idx" ON "teams"("owner_id");

-- CreateIndex
CREATE INDEX "team_identity_history_team_id_created_at_idx" ON "team_identity_history"("team_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");

-- CreateIndex
CREATE INDEX "players_nickname_idx" ON "players"("nickname");

-- CreateIndex
CREATE INDEX "players_country_idx" ON "players"("country");

-- CreateIndex
CREATE INDEX "team_players_team_id_left_at_idx" ON "team_players"("team_id", "left_at");

-- CreateIndex
CREATE INDEX "team_players_player_id_left_at_idx" ON "team_players"("player_id", "left_at");

-- CreateIndex
CREATE INDEX "team_invitations_player_id_status_idx" ON "team_invitations"("player_id", "status");

-- CreateIndex
CREATE INDEX "tournament_registrations_tournament_id_status_idx" ON "tournament_registrations"("tournament_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_team_id_key" ON "tournament_registrations"("tournament_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_player_id_key" ON "tournament_registrations"("tournament_id", "player_id");

-- CreateIndex
CREATE INDEX "matches_tournament_id_status_idx" ON "matches"("tournament_id", "status");

-- CreateIndex
CREATE INDEX "matches_scheduled_at_idx" ON "matches"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "matches_tournament_id_bracket_round_position_group_label_key" ON "matches"("tournament_id", "bracket", "round", "position", "group_label");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_match_id_slot_key" ON "match_participants"("match_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_match_id_registration_id_key" ON "match_participants"("match_id", "registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_match_id_version_key" ON "match_results"("match_id", "version");

-- CreateIndex
CREATE INDEX "match_schedules_match_id_created_at_idx" ON "match_schedules"("match_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "match_lineups_match_id_player_id_key" ON "match_lineups"("match_id", "player_id");

-- CreateIndex
CREATE INDEX "tournament_standings_tournament_id_group_label_points_idx" ON "tournament_standings"("tournament_id", "group_label", "points");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_standings_tournament_id_registration_id_group_la_key" ON "tournament_standings"("tournament_id", "registration_id", "group_label");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_organizer_id_is_current_idx" ON "subscriptions"("organizer_id", "is_current");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_provider_payment_id_key" ON "subscription_payments"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_idempotency_key_key" ON "subscription_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "subscription_payments_status_created_at_idx" ON "subscription_payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_payment_id_key" ON "subscription_invoices"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_number_key" ON "subscription_invoices"("number");

-- CreateIndex
CREATE INDEX "subscription_history_subscription_id_created_at_idx" ON "subscription_history"("subscription_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_usage_organizer_id_feature_key_period_start_key" ON "feature_usage"("organizer_id", "feature_key", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "promotional_codes_code_key" ON "promotional_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "organizer_verifications_status_submitted_at_idx" ON "organizer_verifications"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "organizer_verifications_organizer_id_idx" ON "organizer_verifications"("organizer_id");

-- CreateIndex
CREATE INDEX "verification_history_verification_id_created_at_idx" ON "verification_history"("verification_id", "created_at");

-- CreateIndex
CREATE INDEX "organizer_ratings_organizer_id_moderation_status_created_at_idx" ON "organizer_ratings"("organizer_id", "moderation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_ratings_participant_id_tournament_id_key" ON "organizer_ratings"("participant_id", "tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_responses_rating_id_key" ON "organizer_responses"("rating_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_reputation_organizer_id_key" ON "organizer_reputation"("organizer_id");

-- CreateIndex
CREATE INDEX "organizer_reputation_reputation_level_average_score_idx" ON "organizer_reputation"("reputation_level", "average_score");

-- CreateIndex
CREATE INDEX "organizer_incidents_organizer_id_status_idx" ON "organizer_incidents"("organizer_id", "status");

-- CreateIndex
CREATE INDEX "rating_history_rating_id_created_at_idx" ON "rating_history"("rating_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rating_reports_rating_id_reported_by_key" ON "rating_reports"("rating_id", "reported_by");

-- CreateIndex
CREATE INDEX "player_game_profiles_game_id_competitive_level_idx" ON "player_game_profiles"("game_id", "competitive_level");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_profiles_player_id_game_id_key" ON "player_game_profiles"("player_id", "game_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_statistics_player_id_game_id_key" ON "player_game_statistics"("player_id", "game_id");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements"("code");

-- CreateIndex
CREATE UNIQUE INDEX "player_achievements_player_id_game_id_achievement_id_key" ON "player_achievements"("player_id", "game_id", "achievement_id");

-- CreateIndex
CREATE INDEX "player_game_history_player_id_game_id_recorded_at_idx" ON "player_game_history"("player_id", "game_id", "recorded_at");

-- CreateIndex
CREATE INDEX "ranking_seasons_game_id_status_idx" ON "ranking_seasons"("game_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_rules_game_id_competition_type_version_key" ON "ranking_rules"("game_id", "competition_type", "version");

-- CreateIndex
CREATE INDEX "player_rankings_game_id_season_id_points_idx" ON "player_rankings"("game_id", "season_id", "points");

-- CreateIndex
CREATE INDEX "player_rankings_game_id_season_id_country_code_points_idx" ON "player_rankings"("game_id", "season_id", "country_code", "points");

-- CreateIndex
CREATE UNIQUE INDEX "player_rankings_player_id_game_id_season_id_key" ON "player_rankings"("player_id", "game_id", "season_id");

-- CreateIndex
CREATE INDEX "team_rankings_game_id_season_id_points_idx" ON "team_rankings"("game_id", "season_id", "points");

-- CreateIndex
CREATE UNIQUE INDEX "team_rankings_team_id_game_id_season_id_key" ON "team_rankings"("team_id", "game_id", "season_id");

-- CreateIndex
CREATE INDEX "ranking_snapshots_ranking_type_game_id_season_id_snapshot_d_idx" ON "ranking_snapshots"("ranking_type", "game_id", "season_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_snapshots_ranking_type_participant_id_game_id_seaso_key" ON "ranking_snapshots"("ranking_type", "participant_id", "game_id", "season_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_events_event_reference_key" ON "ranking_events"("event_reference");

-- CreateIndex
CREATE INDEX "ranking_events_participant_id_game_id_created_at_idx" ON "ranking_events"("participant_id", "game_id", "created_at");

-- CreateIndex
CREATE INDEX "ranking_audit_logs_entity_type_entity_id_idx" ON "ranking_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "match_streams_stream_status_scheduled_start_at_idx" ON "match_streams"("stream_status", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "match_streams_match_id_idx" ON "match_streams"("match_id");

-- CreateIndex
CREATE INDEX "match_stream_history_match_stream_id_created_at_idx" ON "match_stream_history"("match_stream_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_profiles" ADD CONSTRAINT "organizer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_members" ADD CONSTRAINT "organizer_members_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_members" ADD CONSTRAINT "organizer_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_ranks" ADD CONSTRAINT "game_ranks_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_min_rank_id_fkey" FOREIGN KEY ("min_rank_id") REFERENCES "game_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_max_rank_id_fkey" FOREIGN KEY ("max_rank_id") REFERENCES "game_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_champion_registration_id_fkey" FOREIGN KEY ("champion_registration_id") REFERENCES "tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_identity_history" ADD CONSTRAINT "team_identity_history_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_next_match_id_fkey" FOREIGN KEY ("next_match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_loser_next_match_id_fkey" FOREIGN KEY ("loser_next_match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "tournament_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_winner_registration_id_fkey" FOREIGN KEY ("winner_registration_id") REFERENCES "tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_schedules" ADD CONSTRAINT "match_schedules_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_schedules" ADD CONSTRAINT "match_schedules_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_standings" ADD CONSTRAINT "tournament_standings_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_standings" ADD CONSTRAINT "tournament_standings_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "tournament_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promotional_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "subscription_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_from_plan_id_fkey" FOREIGN KEY ("from_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_to_plan_id_fkey" FOREIGN KEY ("to_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_usage" ADD CONSTRAINT "feature_usage_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_verifications" ADD CONSTRAINT "organizer_verifications_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_verifications" ADD CONSTRAINT "organizer_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "organizer_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "organizer_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_ratings" ADD CONSTRAINT "organizer_ratings_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_ratings" ADD CONSTRAINT "organizer_ratings_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_ratings" ADD CONSTRAINT "organizer_ratings_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_responses" ADD CONSTRAINT "organizer_responses_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "organizer_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_responses" ADD CONSTRAINT "organizer_responses_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_reputation" ADD CONSTRAINT "organizer_reputation_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_incidents" ADD CONSTRAINT "organizer_incidents_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_incidents" ADD CONSTRAINT "organizer_incidents_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_incidents" ADD CONSTRAINT "organizer_incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_incidents" ADD CONSTRAINT "organizer_incidents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "organizer_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_reports" ADD CONSTRAINT "rating_reports_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "organizer_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_reports" ADD CONSTRAINT "rating_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_profiles" ADD CONSTRAINT "player_game_profiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_profiles" ADD CONSTRAINT "player_game_profiles_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_profiles" ADD CONSTRAINT "player_game_profiles_game_rank_id_fkey" FOREIGN KEY ("game_rank_id") REFERENCES "game_ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_statistics" ADD CONSTRAINT "player_game_statistics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_statistics" ADD CONSTRAINT "player_game_statistics_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_history" ADD CONSTRAINT "player_game_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_history" ADD CONSTRAINT "player_game_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_seasons" ADD CONSTRAINT "ranking_seasons_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_rules" ADD CONSTRAINT "ranking_rules_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_rankings" ADD CONSTRAINT "team_rankings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_rankings" ADD CONSTRAINT "team_rankings_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_rankings" ADD CONSTRAINT "team_rankings_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_audit_logs" ADD CONSTRAINT "ranking_audit_logs_administrator_id_fkey" FOREIGN KEY ("administrator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_streams" ADD CONSTRAINT "match_streams_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_streams" ADD CONSTRAINT "match_streams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_stream_history" ADD CONSTRAINT "match_stream_history_match_stream_id_fkey" FOREIGN KEY ("match_stream_id") REFERENCES "match_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_stream_history" ADD CONSTRAINT "match_stream_history_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
