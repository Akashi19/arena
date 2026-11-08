-- DropIndex
DROP INDEX "players_nickname_trgm";

-- DropIndex
DROP INDEX "tournaments_name_trgm";

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "mvp_player_id" UUID;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_mvp_player_id_fkey" FOREIGN KEY ("mvp_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
