import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';

import { initDatabase, pool } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import voucherRoutes from './routes/voucher.routes.js';
import userRoutes from './routes/user.routes.js';
import auditRoutes from './routes/audit.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_BUILD_DIR = path.resolve(__dirname, '../web/build');

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    return res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', database: 'disconnected', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditRoutes);

app.use('/api/*', (_req, res) => {
  return res.status(404).json({ error: 'API endpoint not found.' });
});

if (fs.existsSync(WEB_BUILD_DIR)) {
  app.use(express.static(WEB_BUILD_DIR));
  app.get('*', (_req, res) => {
    return res.sendFile(path.join(WEB_BUILD_DIR, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    return res.status(200).json({
      message: 'ODF Loyalty Voucher API running. Build SvelteKit frontend with "npm run build" to serve UI.',
    });
  });
}

app.use(errorHandler);

async function start() {
  // Validate JWT_SECRET before accepting any connections
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 16) {
      console.error('[odf-voucher-portal] FATAL: JWT_SECRET environment variable must be set to at least 16 characters in production.');
      console.error('[odf-voucher-portal] Set it in your EKAFY tenant environment variables and redeploy.');
      process.exit(1);
    }
  }

  await initDatabase();
  const server = app.listen(PORT, HOST, () => {
    console.log(`[odf-voucher-portal] Listening on http://${HOST}:${PORT}`);
  });

  const shutdown = async () => {
    console.log('[odf-voucher-portal] Shutting down gracefully...');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[odf-voucher-portal] Fatal startup error:', err);
  process.exit(1);
});
