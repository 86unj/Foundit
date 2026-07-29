import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  auditEvents,
  prohibitedAuditDetailKeys,
} from '../src/utils/auditEvents';
import { auditSummaries } from '../src/utils/auditSummaries';

const registry = readFileSync(
  new URL('../docs/audit-events.md', import.meta.url),
  'utf8'
);
const executableAuditSources = [
  '../src/routes/auth.ts',
  '../src/routes/claims.ts',
  '../src/routes/items.ts',
  '../src/routes/photoSessions.ts',
  '../src/routes/reportLinks.ts',
  '../src/routes/uploads.ts',
  '../src/routes/users.ts',
  '../src/middleware/requireRole.ts',
  '../src/lib/claimEmailNotifications.ts',
  '../src/lib/matching/suggestions.ts',
  '../src/lib/notifications.ts',
  '../src/jobs/cleanupUnverifiedUsers.ts',
  '../src/jobs/expireRetainedItems.ts',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');

describe('audit event coverage registry', () => {
  test('every typed action has complete metadata and documentation', () => {
    for (const [action, metadata] of Object.entries(auditEvents)) {
      expect(metadata.owner).toBeTruthy();
      expect(metadata.entityType).toBeTruthy();
      expect(['required', 'best_effort']).toContain(metadata.policy);
      expect(metadata.requiredDetailKeys).toEqual(expect.any(Array));
      expect(
        metadata.requiredDetailKeys.every((key) =>
          metadata.detailKeys.includes(key)
        )
      ).toBe(true);
      expect(registry).toContain(`\`${action}\``);
    }
  });

  test('catalog actions are unique and sensitive detail keys stay prohibited', () => {
    const actions = Object.keys(auditEvents);
    expect(new Set(actions).size).toBe(actions.length);
    expect(prohibitedAuditDetailKeys).toEqual(
      expect.arrayContaining([
        'password',
        'accesstoken',
        'refreshtoken',
        'verificationtoken',
        'tokenhash',
        'presignedurl',
        'objectkey',
        'email',
        'studentnumber',
      ])
    );
  });

  test('every typed action has an executable call site', () => {
    for (const action of Object.keys(auditEvents)) {
      expect(executableAuditSources).toContain(`'${action}'`);
    }
  });

  test('documents low-value and unfinished exclusions', () => {
    expect(registry).toContain('Notification read, unread, and read-all');
    expect(registry).toContain('501 NOT_IMPLEMENTED');
    expect(registry).toContain('Audit-log query, export, download, UI');
  });

  test('every typed action has a human-readable summary registry entry', () => {
    for (const action of Object.keys(auditEvents)) {
      expect(auditSummaries).toHaveProperty(action);
      expect(typeof auditSummaries[action as keyof typeof auditSummaries]).toBe(
        'function'
      );
    }
  });

  test('documents the actorRole/entityLabel/summary enrichment fields', () => {
    expect(registry).toContain('actorRole');
    expect(registry).toContain('entityLabel');
    expect(registry).toContain('summary');
  });
});
