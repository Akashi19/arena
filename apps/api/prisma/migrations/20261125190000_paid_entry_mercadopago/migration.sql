-- Toda cuota de inscripción mayor que cero se cobra con Mercado Pago: collect_online pasa a reflejar entry_fee > 0.
UPDATE "tournaments" SET "collect_online" = ("entry_fee" > 0);
