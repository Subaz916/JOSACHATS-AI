import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, publicConfig, capabilities } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import agentsRouter from './routes/agents.js';
import knowledgeRouter from './routes/knowledge.js';
import catalogRouter from './routes/catalog.js';
import publicRouter from './routes/public.js';
import conversationsRouter from './routes/conversations.js';
import humanSupportRouter from './routes/human-support.js';
import dashboardRouter from './routes/dashboard.js';
import analyticsRouter from './routes/analytics.js';
import billingRouter from './routes/billing.js';
import adminRouter from './routes/admin.js';
import systemRouter from './routes/system.js';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.set('trust proxy', 1);

const allowedOrigins = [env.appUrl, env.publicAppUrl, ...env.corsOrigins].filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return callback(null, true);
    return callback(null, false);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Channel']
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  next();
});

const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health'
});
app.use('/api', limiter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'josa-chats', time: new Date().toISOString() });
});
app.get('/api/config', (req, res) => res.json(publicConfig()));

app.use('/api/webhooks/safepay', express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.json({ limit: '2mb', verify: (req, res, buffer) => { req.rawBody = buffer; } }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api/agents', agentsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/products', catalogRouter);
app.use('/api/services', catalogRouter);
app.use('/api/public', publicRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/human-support', humanSupportRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api', billingRouter);
app.use('/api/admin', adminRouter);
app.use('/api', systemRouter);

app.use(express.static(path.join(root, 'frontend'), { extensions: ['html'], index: 'index.html' }));
app.get(['/chat/:slug', '/agent/:slug'], (req, res) => res.sendFile(path.join(root, 'frontend', 'public-chat', 'chat.html')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(root, 'frontend', 'index.html'));
});
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info('server_started', { port: env.port, environment: env.nodeEnv, capabilities });
});
