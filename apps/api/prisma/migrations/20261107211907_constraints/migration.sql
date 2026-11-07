-- Restricciones de integridad que Prisma no expresa de forma declarativa.

-- Una sola solicitud de verificación abierta por organizador (evita duplicadas)
CREATE UNIQUE INDEX "organizer_verifications_one_open_per_organizer"
  ON "organizer_verifications" ("organizer_id") WHERE "is_open" = true;

-- Máximo una transmisión activa por partida (salvo retransmisiones)
CREATE UNIQUE INDEX "match_streams_one_active_per_match"
  ON "match_streams" ("match_id") WHERE "is_active" = true AND "is_rebroadcast" = false;

-- Una sola suscripción vigente por organizador
CREATE UNIQUE INDEX "subscriptions_one_current_per_organizer"
  ON "subscriptions" ("organizer_id") WHERE "is_current" = true;

-- Rankings: unicidad con season_id NULL (ranking histórico)
CREATE UNIQUE INDEX "player_rankings_historic_unique"
  ON "player_rankings" ("player_id", "game_id") WHERE "season_id" IS NULL;
CREATE UNIQUE INDEX "team_rankings_historic_unique"
  ON "team_rankings" ("team_id", "game_id") WHERE "season_id" IS NULL;

-- Inscripción: exactamente uno de team_id / player_id
ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "registration_team_xor_player"
  CHECK (("team_id" IS NOT NULL) <> ("player_id" IS NOT NULL));

-- Torneo: deporte o videojuego según categoría
ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournament_discipline_matches_category"
  CHECK (("category" = 'SPORT' AND "sport_id" IS NOT NULL AND "game_id" IS NULL)
      OR ("category" = 'ESPORT' AND "game_id" IS NOT NULL AND "sport_id" IS NULL));

ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournament_max_participants_positive" CHECK ("max_participants" >= 2);
ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournament_entry_fee_non_negative" CHECK ("entry_fee" >= 0);
ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournament_deadline_before_start" CHECK ("registration_deadline" <= "starts_at");

-- Valoraciones: 1..5 estrellas
ALTER TABLE "organizer_ratings"
  ADD CONSTRAINT "rating_scores_range" CHECK (
    "organization_score" BETWEEN 1 AND 5 AND "punctuality_score" BETWEEN 1 AND 5 AND
    "communication_score" BETWEEN 1 AND 5 AND "transparency_score" BETWEEN 1 AND 5 AND
    "overall_experience_score" BETWEEN 1 AND 5);

-- Búsqueda de torneos por nombre (trigramas)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "tournaments_name_trgm" ON "tournaments" USING gin ("name" gin_trgm_ops);
CREATE INDEX "players_nickname_trgm" ON "players" USING gin ("nickname" gin_trgm_ops);
