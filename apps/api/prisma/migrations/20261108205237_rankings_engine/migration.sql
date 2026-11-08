-- CreateEnum
CREATE TYPE "ResultReportStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "ranking_suspended_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ranking_events" ADD COLUMN     "placement" INTEGER,
ADD COLUMN     "revert_reason" TEXT,
ADD COLUMN     "reverted_at" TIMESTAMP(3),
ADD COLUMN     "reverted_by_id" UUID;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "ranking_suspended_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ranking_result_reports" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ResultReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_result_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranking_result_reports_status_created_at_idx" ON "ranking_result_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "ranking_result_reports_match_id_idx" ON "ranking_result_reports"("match_id");

-- CreateIndex
CREATE INDEX "ranking_events_game_id_is_reverted_idx" ON "ranking_events"("game_id", "is_reverted");

-- CreateIndex
CREATE INDEX "ranking_events_tournament_id_idx" ON "ranking_events"("tournament_id");

-- AddForeignKey
ALTER TABLE "ranking_result_reports" ADD CONSTRAINT "ranking_result_reports_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_result_reports" ADD CONSTRAINT "ranking_result_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
