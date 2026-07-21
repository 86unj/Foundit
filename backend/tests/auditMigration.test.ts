import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260720180000_harden_audit_log/migration.sql',
    import.meta.url
  ),
  'utf8'
);

describe('audit log migration contract', () => {
  test('backfills attribution before enforcing the new contract', () => {
    expect(migration).toContain('WHEN "actor_id" IS NOT NULL THEN \'user\'');
    expect(migration).toContain(
      "'item_auto_expired', 'unverified_user_deleted'"
    );
    expect(migration.indexOf('UPDATE "audit_log"')).toBeLessThan(
      migration.indexOf('ALTER COLUMN "actor_type" SET NOT NULL')
    );
    expect(migration).toContain(
      'CREATE TRIGGER "audit_log_fill_contract_defaults_trigger"'
    );
    expect(
      migration.indexOf('audit_log_fill_contract_defaults_trigger')
    ).toBeLessThan(migration.indexOf('ALTER COLUMN "actor_type" SET NOT NULL'));
  });

  test('retains actor ids and supports anonymous targets and correlation', () => {
    expect(migration).toContain('ALTER COLUMN "entity_id" DROP NOT NULL');
    expect(migration).toContain(
      'DROP CONSTRAINT IF EXISTS "audit_log_actor_id_fkey"'
    );
    expect(migration).not.toMatch(/DROP COLUMN "actor_id"/);
    for (const column of ['request_id', 'run_id', 'actor_type', 'outcome']) {
      expect(migration).toContain(`audit_log_${column}_idx`);
    }
  });
});
