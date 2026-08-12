import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import claimsRouter from './routes/claims';
import reportLinksRouter from './routes/reportLinks';
import itemsRouter from './routes/items';
import campusesRouter from './routes/campuses';
import usersRouter from './routes/users';
import notificationsRouter from './routes/notifications';
import adminUsersRouter from './routes/admin/users';
import errorHandler from './middleware/errorHandler';
import { startCleanupJob } from './jobs/cleanupUnverifiedUsers';
import { startExpireRetainedItemsJob } from './jobs/expireRetainedItems';
import { startExpireOpenClaimsJob } from './jobs/expireOpenClaims';
import uploadsRouter from './routes/uploads';
import photoSessionsRouter from './routes/photoSessions';
import requestContext from './middleware/requestContext';
import { warnIfSemanticMatchingDegraded } from './lib/matching/embeddings';
import { parseAllowedOrigins } from './utils/corsOrigins';

// Fail fast if required JWT secrets are missing
if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error(
    'FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment'
  );
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// In production the app sits behind Nginx on the same host, so the socket
// address is always 127.0.0.1. Without this, req.ip is identical for every
// user: all rate limiters collapse into one shared bucket and audit logs
// record the proxy instead of the caller. Trust exactly one hop (Nginx);
// raise TRUST_PROXY_HOPS if another proxy (e.g. Cloudflare) is added in front.
// A malformed value falls back to 1 rather than handing Express a NaN, which
// it would treat as "trust nothing" and silently reinstate the shared bucket.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10);
app.set(
  'trust proxy',
  Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1
);

// CORS_ORIGIN is a comma-separated allowlist (see utils/corsOrigins.ts); a
// single value behaves exactly as it did before.
app.use(cors({ origin: parseAllowedOrigins(process.env.CORS_ORIGIN) }));
app.use(express.json());
app.use(requestContext);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/report-links', reportLinksRouter);
app.use('/api', itemsRouter);
app.use('/api/campuses', campusesRouter);
app.use('/api/users', usersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/photo-sessions', photoSessionsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Surface the hash-embedding fallback at boot instead of letting matching
  // quietly return near-random results.
  warnIfSemanticMatchingDegraded();
  startCleanupJob();
  startExpireRetainedItemsJob();
  startExpireOpenClaimsJob();
});
