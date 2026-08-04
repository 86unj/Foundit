import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import campusesRouter from '../src/routes/campuses';

vi.mock('../src/db', () => ({
  prisma: {
    campus: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/db';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/campuses', campusesRouter);
  return app;
}

describe('campuses routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('GET /api/campuses returns campus list', async () => {
    vi.mocked(prisma.campus.findMany).mockResolvedValueOnce([
      {
        campusId: 'campus-1',
        campusName: 'Newnham',
        address: '1750 Finch Ave E',
        retentionDays: 30,
      },
      {
        campusId: 'campus-2',
        campusName: 'Seneca@York',
        address: '70 The Pond Rd',
        retentionDays: 30,
      },
    ]);

    const app = createTestApp();

    const res = await request(app).get('/api/campuses');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        campusId: 'campus-1',
        campusName: 'Newnham',
      }),
      expect.objectContaining({
        campusId: 'campus-2',
        campusName: 'Seneca@York',
      }),
    ]);

    expect(prisma.campus.findMany).toHaveBeenCalledWith({
      where: {
        campusId: { not: '00000000-0000-0000-0000-000000000000' },
      },
      select: {
        campusId: true,
        campusName: true,
      },
      orderBy: { campusName: 'asc' },
    });
  });
});
