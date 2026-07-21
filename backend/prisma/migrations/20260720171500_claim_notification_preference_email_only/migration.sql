-- Keep existing claim rows valid before narrowing the enum to email-only.
UPDATE "claim"
SET "notification_preference" = 'email'
WHERE "notification_preference" IN ('phone', 'email_and_phone');

ALTER TYPE "claim_notification_preference" RENAME TO "claim_notification_preference_old";

CREATE TYPE "claim_notification_preference" AS ENUM ('email');

ALTER TABLE "claim"
ALTER COLUMN "notification_preference" DROP DEFAULT,
ALTER COLUMN "notification_preference" TYPE "claim_notification_preference"
USING "notification_preference"::text::"claim_notification_preference",
ALTER COLUMN "notification_preference" SET DEFAULT 'email';

DROP TYPE "claim_notification_preference_old";
