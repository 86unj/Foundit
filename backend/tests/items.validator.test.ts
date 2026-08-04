import { describe, expect, test } from 'vitest';
import {
  createSecurityItemSchema,
  itemParamsSchema,
  listSecurityItemsQuerySchema,
  publicItemsQuerySchema,
  updateSecurityItemStatusSchema,
  updateSecurityItemSchema,
  walkInReleaseSchema,
} from '../src/validators/items';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('items validators', () => {
  test('accepts valid public items query', () => {
    const result = publicItemsQuerySchema.safeParse({
      category: 'Electronics',
      campusId: uuid,
    });

    expect(result.success).toBe(true);
  });

  test('rejects invalid campusId in public query', () => {
    const result = publicItemsQuerySchema.safeParse({
      campusId: 'bad-id',
    });

    expect(result.success).toBe(false);
  });

  test('accepts valid security item list query', () => {
    const result = listSecurityItemsQuerySchema.safeParse({
      status: 'stored',
      limit: '10',
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  test('rejects limit over 50', () => {
    const result = listSecurityItemsQuerySchema.safeParse({
      limit: '100',
    });

    expect(result.success).toBe(false);
  });

  test('accepts valid item params', () => {
    const result = itemParamsSchema.safeParse({
      itemId: uuid,
    });

    expect(result.success).toBe(true);
  });

  test('rejects invalid item params', () => {
    const result = itemParamsSchema.safeParse({
      itemId: 'abc',
    });

    expect(result.success).toBe(false);
  });

  test('accepts valid create security item body', () => {
    const result = createSecurityItemSchema.safeParse({
      campusId: uuid,
      title: 'iPhone',
      description: 'Black iPhone found near library',
      category: 'Electronics',
      locationFound: 'Library',
      dateFound: '2026-07-01',
      images: [
        {
          imageUrl: 'reports/11111111-1111-1111-1111-111111111111.jpg',
          fileType: 'jpg',
          fileSizeKb: 120,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test('rejects create security item with no images', () => {
    const result = createSecurityItemSchema.safeParse({
      campusId: uuid,
      title: 'iPhone',
      description: 'Black iPhone found near library',
      category: 'Electronics',
      locationFound: 'Library',
      dateFound: '2026-07-01',
      images: [],
    });

    expect(result.success).toBe(false);
  });

  test('rejects empty title when creating item', () => {
    const result = createSecurityItemSchema.safeParse({
      campusId: uuid,
      title: '',
      description: 'Black iPhone found near library',
      category: 'Electronics',
      locationFound: 'Library',
      dateFound: '2026-07-01',
      images: [
        {
          imageUrl: 'reports/11111111-1111-1111-1111-111111111111.jpg',
          fileType: 'jpg',
          fileSizeKb: 120,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('accepts valid update security item body', () => {
    const result = updateSecurityItemSchema.safeParse({
      title: 'Wallet',
      category: 'Personal Items',
      dateFound: '2026-07-01',
      locationFound: 'Library',
      descriptionInternal: 'Stored in cabinet A',
    });

    expect(result.success).toBe(true);
  });

  test('accepts valid walk-in release body', () => {
    const result = walkInReleaseSchema.safeParse({
      studentFullName: 'Casey Hsu',
      idVerified: 'Seneca OneCard',
      contactNumber: '4161234567',
      verificationNote: 'Student showed ID',
    });

    expect(result.success).toBe(true);
  });

  test('rejects invalid status update', () => {
    const result = updateSecurityItemStatusSchema.safeParse({
      status: 'stored',
      note: 'wrong status',
    });

    expect(result.success).toBe(false);
  });

  test('accepts expired or disposed status update', () => {
    const result = updateSecurityItemStatusSchema.safeParse({
      status: 'expired',
      note: 'Retention period ended',
    });

    expect(result.success).toBe(true);
  });
});
