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
import uploadsRouter from './routes/uploads';
import photoSessionsRouter from './routes/photoSessions';

// Fail fast if required JWT secrets are missing
if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error(
    'FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment'
  );
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

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
  startCleanupJob();
  startExpireRetainedItemsJob();
});
