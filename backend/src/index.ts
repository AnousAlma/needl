/**
 * Needl driver API — wire-protocol MongoDB access for the mobile app.
 * Requires HTTPS in production. Request bodies include the user's cluster URI; treat this service as sensitive.
 */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { verifyIdToken } from './firebaseAdmin.js';
import { handleCreateDonationSession, handleStripeWebhook, isStripeDonateConfigured } from './stripeDonate.js';
import {
  createDatabaseWithCollection,
  createMongoCollection,
  deleteOneById,
  dropMongoCollection,
  findDocuments,
  insertOneDocument,
  listCollectionNames,
  listCollectionsWithEstimates,
  listDatabasesWithStats,
  replaceDocument,
} from './mongo.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(helmet());

/** Stripe webhooks need the raw body for signature verification (must run before express.json). */
app.post('/v1/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  void handleStripeWebhook(req, res);
});

const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
if (!corsOrigins || corsOrigins.length === 0) {
  console.warn(
    '[needl-driver-api] WARNING: CORS_ORIGINS is not set. Cross-origin requests will be blocked. ' +
      'Set CORS_ORIGINS to a comma-separated list of allowed origins (e.g. https://yourapp.com).',
  );
}
app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : false,
  }),
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/v1/', apiLimiter);

app.use(express.json({ limit: '1mb' }));

async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <Firebase ID token>' });
    return;
  }
  try {
    const uid = await verifyIdToken(token);
    (req as express.Request & { needlUid?: string }).needlUid = uid;
    next();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(401).json({ error: msg });
  }
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'needl-driver-api',
    docs: '/health',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'needl-driver-api',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/v1/stripe/donate-status', (_req, res) => {
  res.json({ enabled: isStripeDonateConfigured() });
});

app.post('/v1/stripe/create-donation-session', authMiddleware, (req, res) => {
  const uid = (req as express.Request & { needlUid?: string }).needlUid ?? '';
  void handleCreateDonationSession(uid, req.body, res);
});

app.get('/v1/me', authMiddleware, (req, res) => {
  const uid = (req as express.Request & { needlUid?: string }).needlUid;
  res.json({ uid });
});

app.post('/v1/mongo/list-databases', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  if (!uri) {
    res.status(400).json({ error: 'Body must include uri (MongoDB connection string)' });
    return;
  }
  try {
    const databases = await listDatabasesWithStats(uri);
    res.json({ databases });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/list-collections-detailed', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  if (!uri || !database) {
    res.status(400).json({ error: 'Body must include uri and database' });
    return;
  }
  try {
    const collections = await listCollectionsWithEstimates(uri, database);
    res.json({ collections });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/list-collections', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  if (!uri || !database) {
    res.status(400).json({ error: 'Body must include uri and database' });
    return;
  }
  try {
    const collections = await listCollectionNames(uri, database);
    res.json({ collections });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/find', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const collection = typeof req.body?.collection === 'string' ? req.body.collection.trim() : '';
  if (!uri || !database || !collection) {
    res.status(400).json({ error: 'Body must include uri, database, and collection' });
    return;
  }

  let filter: Record<string, unknown> = {};
  if (req.body?.filter !== undefined) {
    if (req.body.filter === null || typeof req.body.filter !== 'object' || Array.isArray(req.body.filter)) {
      res.status(400).json({ error: 'filter must be a JSON object' });
      return;
    }
    filter = req.body.filter as Record<string, unknown>;
  }

  const limit = typeof req.body?.limit === 'number' ? req.body.limit : 20;
  const skip = typeof req.body?.skip === 'number' ? req.body.skip : 0;

  let sort: Record<string, 1 | -1> | undefined;
  if (req.body?.sort !== undefined) {
    if (req.body.sort === null || typeof req.body.sort !== 'object' || Array.isArray(req.body.sort)) {
      res.status(400).json({ error: 'sort must be a JSON object of field: 1 | -1' });
      return;
    }
    sort = req.body.sort as Record<string, 1 | -1>;
  }

  try {
    const documents = await findDocuments(uri, database, collection, { filter, limit, skip, sort });
    res.json({ documents });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/create-database', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const seedCollection =
    typeof req.body?.seedCollection === 'string' ? req.body.seedCollection.trim() : 'data';
  if (!uri || !database) {
    res.status(400).json({ error: 'Body must include uri and database' });
    return;
  }
  try {
    await createDatabaseWithCollection(uri, database, seedCollection || 'data');
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/create-collection', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const collection = typeof req.body?.collection === 'string' ? req.body.collection.trim() : '';
  if (!uri || !database || !collection) {
    res.status(400).json({ error: 'Body must include uri, database, and collection' });
    return;
  }
  try {
    await createMongoCollection(uri, database, collection);
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/insert-one', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const collection = typeof req.body?.collection === 'string' ? req.body.collection.trim() : '';
  if (!uri || !database || !collection) {
    res.status(400).json({ error: 'Body must include uri, database, and collection' });
    return;
  }
  let doc: Record<string, unknown> = {};
  if (req.body?.document !== undefined) {
    if (req.body.document === null || typeof req.body.document !== 'object' || Array.isArray(req.body.document)) {
      res.status(400).json({ error: 'document must be a JSON object when provided' });
      return;
    }
    doc = req.body.document as Record<string, unknown>;
  }
  try {
    const r = await insertOneDocument(uri, database, collection, doc);
    res.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/replace-one', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const collection = typeof req.body?.collection === 'string' ? req.body.collection.trim() : '';
  const replacement = req.body?.replacement;
  if (!uri || !database || !collection) {
    res.status(400).json({ error: 'Body must include uri, database, and collection' });
    return;
  }
  if (replacement === null || typeof replacement !== 'object' || Array.isArray(replacement)) {
    res.status(400).json({ error: 'replacement must be a JSON object with _id' });
    return;
  }

  try {
    const r = await replaceDocument(uri, database, collection, replacement as Record<string, unknown>);
    res.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/delete-one', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const collection = typeof req.body?.collection === 'string' ? req.body.collection.trim() : '';
  const _id = req.body?._id;
  if (!uri || !database || !collection) {
    res.status(400).json({ error: 'Body must include uri, database, and collection' });
    return;
  }
  if (_id === undefined) {
    res.status(400).json({ error: 'Body must include _id' });
    return;
  }
  try {
    const r = await deleteOneById(uri, database, collection, _id);
    res.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.post('/v1/mongo/drop-collection', authMiddleware, async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
  const database = typeof req.body?.database === 'string' ? req.body.database.trim() : '';
  const collection = typeof req.body?.collection === 'string' ? req.body.collection.trim() : '';
  if (!uri || !database || !collection) {
    res.status(400).json({ error: 'Body must include uri, database, and collection' });
    return;
  }
  try {
    await dropMongoCollection(uri, database, collection);
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
  }
});

app.listen(port, () => {
  console.log(`[needl-driver-api] http://localhost:${port}`);
});
