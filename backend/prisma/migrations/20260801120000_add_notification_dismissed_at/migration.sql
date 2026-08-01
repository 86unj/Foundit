ALTER TABLE "notification"
ADD COLUMN "dismissed_at" TIMESTAMP(3);

CREATE INDEX "notification_recipient_id_dismissed_at_idx"
ON "notification"("recipient_id", "dismissed_at");
