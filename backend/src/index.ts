import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import authRoutes     from './routes/auth.routes';
import fsmRoutes      from './routes/fsm.routes';
import electionRoutes from './routes/election.routes';
import adminRoutes    from './routes/admin.routes';
import { errorMiddleware } from './middleware/error.middleware';

const app  = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',  authRoutes);
app.use('/api/fsm',   fsmRoutes);
app.use('/api',       electionRoutes);   // /api/results
app.use('/api/admin', adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`SecureVote server running on http://localhost:${PORT}`);
});

export default app;
