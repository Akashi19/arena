-- CreateEnum
CREATE TYPE "PaymentAccountStatus" AS ENUM ('CONNECTED', 'NEEDS_RECONNECT', 'DISCONNECTED');

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'PAYMENT_PENDING';

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "registration_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "collect_online" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "organizer_payment_accounts" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "external_user_id" TEXT NOT NULL,
    "public_key" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "live_mode" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "connected_by_id" UUID,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_payments" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "account_id" UUID,
    "payer_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "platform_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "provider_preference_id" TEXT,
    "provider_payment_id" TEXT,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_reason" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_payment_accounts_organizer_id_key" ON "organizer_payment_accounts"("organizer_id");

-- CreateIndex
CREATE INDEX "organizer_payment_accounts_provider_external_user_id_idx" ON "organizer_payment_accounts"("provider", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "registration_payments_idempotency_key_key" ON "registration_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "registration_payments_registration_id_idx" ON "registration_payments"("registration_id");

-- CreateIndex
CREATE INDEX "registration_payments_organizer_id_status_idx" ON "registration_payments"("organizer_id", "status");

-- CreateIndex
CREATE INDEX "registration_payments_status_expires_at_idx" ON "registration_payments"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "organizer_payment_accounts" ADD CONSTRAINT "organizer_payment_accounts_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "tournament_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "organizer_payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un solo pago pendiente por inscripción (los reintentos reutilizan el existente)
CREATE UNIQUE INDEX "registration_payments_one_pending_key" ON "registration_payments"("registration_id") WHERE "status" = 'PENDING';
