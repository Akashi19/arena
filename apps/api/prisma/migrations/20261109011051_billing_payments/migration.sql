-- Módulo 17: pagos de suscripción, webhooks, cambios programados y planes creados por SUPERADMIN.
-- Escrita a mano para conservar los datos existentes (códigos de plan y pagos).

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('NEW', 'UPGRADE', 'RENEWAL');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'SANDBOX';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- Los códigos de plan pasan de enum a texto: SUPERADMIN puede crear planes nuevos sin cambiar el código fuente
ALTER TABLE "subscription_plans" ALTER COLUMN "code" TYPE TEXT USING "code"::text;
ALTER TABLE "promotional_codes" ALTER COLUMN "applies_to_plans" TYPE TEXT[] USING "applies_to_plans"::text[];
DROP TYPE "PlanCode";

-- Pagos: plan y periodo comprados, importes de lista / descuento / crédito y quién inició el pago
ALTER TABLE "subscription_payments"
ADD COLUMN "plan_id" UUID,
ADD COLUMN "billing_period" "BillingPeriod",
ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'NEW',
ADD COLUMN "list_amount" DECIMAL(12,2),
ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "credit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "promo_code_id" UUID,
ADD COLUMN "created_by_id" UUID,
ADD COLUMN "checkout_url" TEXT;

UPDATE "subscription_payments" p
SET "plan_id" = s."plan_id", "billing_period" = s."billing_period", "list_amount" = p."amount"
FROM "subscriptions" s
WHERE s."id" = p."subscription_id";

ALTER TABLE "subscription_payments"
ALTER COLUMN "plan_id" SET NOT NULL,
ALTER COLUMN "billing_period" SET NOT NULL,
ALTER COLUMN "list_amount" SET NOT NULL;

-- Suscripciones: cambio de plan programado y control de avisos de vencimiento
ALTER TABLE "subscriptions"
ADD COLUMN "expiry_notice_at" TIMESTAMP(3),
ADD COLUMN "pending_billing_period" "BillingPeriod",
ADD COLUMN "pending_plan_id" UUID;

-- Numeración correlativa de comprobantes
CREATE SEQUENCE IF NOT EXISTS "subscription_invoice_number_seq" START 1;

-- CreateIndex
CREATE INDEX "subscription_payments_subscription_id_created_at_idx" ON "subscription_payments"("subscription_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_fkey" FOREIGN KEY ("pending_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promotional_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
