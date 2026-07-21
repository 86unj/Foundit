import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import requestContext from '../src/middleware/requestContext';

describe('requestContext middleware', () => {
  test('creates a trusted UUID instead of accepting an incoming request id', async () => {
    const app = express();
    app.use(requestContext);
    app.get('/', (req, res) =>
      res.json({
        requestId: req.auditContext.requestId,
        ipAddress: req.auditContext.ipAddress,
      })
    );

    const response = await request(app)
      .get('/')
      .set('x-request-id', 'attacker-controlled');

    expect(response.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(response.body.requestId).not.toBe('attacker-controlled');
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  test('does not trust forwarded addresses by default', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(requestContext);
    app.get('/', (req, res) => res.json(req.auditContext));

    const response = await request(app)
      .get('/')
      .set('x-forwarded-for', '203.0.113.8');

    expect(response.body.ipAddress).not.toBe('203.0.113.8');
  });
});
