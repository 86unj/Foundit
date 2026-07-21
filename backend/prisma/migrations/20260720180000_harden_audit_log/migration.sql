CREATE TYPE "AuditActorType" AS ENUM ('anonymous', 'user', 'system', 'unknown');
CREATE TYPE "AuditOutcome" AS ENUM ('success', 'denied', 'failure');

ALTER TABLE "audit_log"
  ADD COLUMN "actor_type" "AuditActorType",
  ADD COLUMN "outcome" "AuditOutcome",
  ADD COLUMN "reason_code" VARCHAR(100),
  ADD COLUMN "request_id" UUID,
  ADD COLUMN "run_id" UUID,
  ALTER COLUMN "entity_id" DROP NOT NULL;

UPDATE "audit_log"
SET "actor_type" = CASE
  WHEN "actor_id" IS NOT NULL THEN 'user'::"AuditActorType"
  WHEN "action" IN ('item_auto_expired', 'unverified_user_deleted') THEN 'system'::"AuditActorType"
  ELSE 'unknown'::"AuditActorType"
END,
"outcome" = 'success'::"AuditOutcome";

-- Keep the pre-change application insert-compatible during a staged rollout.
-- New code supplies both fields explicitly; this trigger only fills omitted values.
CREATE FUNCTION "audit_log_fill_contract_defaults"() RETURNS trigger AS $$
BEGIN
  IF NEW."actor_type" IS NULL THEN
    NEW."actor_type" := CASE
      WHEN NEW."actor_id" IS NOT NULL THEN 'user'::"AuditActorType"
      WHEN NEW."action" IN ('item_auto_expired', 'unverified_user_deleted') THEN 'system'::"AuditActorType"
      ELSE 'unknown'::"AuditActorType"
    END;
  END IF;

  IF NEW."outcome" IS NULL THEN
    NEW."outcome" := 'success'::"AuditOutcome";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_fill_contract_defaults_trigger"
BEFORE INSERT ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION "audit_log_fill_contract_defaults"();

ALTER TABLE "audit_log"
  ALTER COLUMN "actor_type" SET NOT NULL,
  ALTER COLUMN "outcome" SET NOT NULL;

ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_actor_id_fkey";

CREATE INDEX "audit_log_request_id_idx" ON "audit_log"("request_id");
CREATE INDEX "audit_log_run_id_idx" ON "audit_log"("run_id");
CREATE INDEX "audit_log_actor_type_idx" ON "audit_log"("actor_type");
CREATE INDEX "audit_log_outcome_idx" ON "audit_log"("outcome");
