-- CreateEnum
CREATE TYPE "CollectionMode" AS ENUM ('ORGANIZER_ACCOUNT', 'PLATFORM');

-- AlterTable
ALTER TABLE "registration_payments" ADD COLUMN     "collection_mode" "CollectionMode" NOT NULL DEFAULT 'ORGANIZER_ACCOUNT',
ADD COLUMN     "payout_id" UUID,
ADD COLUMN     "recovered_in_payout_id" UUID;

-- CreateTable
CREATE TABLE "organizer_payout_profiles" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "holder_name" VARCHAR(120) NOT NULL,
    "document_id" VARCHAR(30) NOT NULL,
    "bank_name" VARCHAR(80) NOT NULL,
    "account_type" VARCHAR(30) NOT NULL,
    "account_number_enc" TEXT NOT NULL,
    "account_number_last4" VARCHAR(4) NOT NULL,
    "country" CHAR(2) NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_payout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_payouts" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "note" VARCHAR(300),
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_payout_profiles_organizer_id_key" ON "organizer_payout_profiles"("organizer_id");

-- CreateIndex
CREATE INDEX "organizer_payouts_organizer_id_paid_at_idx" ON "organizer_payouts"("organizer_id", "paid_at");

-- CreateIndex
CREATE INDEX "registration_payments_organizer_id_collection_mode_status_idx" ON "registration_payments"("organizer_id", "collection_mode", "status");

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "organizer_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_payments" ADD CONSTRAINT "registration_payments_recovered_in_payout_id_fkey" FOREIGN KEY ("recovered_in_payout_id") REFERENCES "organizer_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_payout_profiles" ADD CONSTRAINT "organizer_payout_profiles_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_payouts" ADD CONSTRAINT "organizer_payouts_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_payouts" ADD CONSTRAINT "organizer_payouts_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

