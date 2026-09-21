import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

// All admin routes require ADMIN role
router.use(requireAdmin);

const candidateSchema = z.object({
  name: z.string().min(1).max(100),
  slot: z.number().int().min(0).max(3),
});

const createElectionSchema = z.object({
  title: z.string().min(1).max(200),
  candidates: z
    .array(candidateSchema)
    .min(1)
    .max(4, 'Maximum 4 candidates (hardware encoder width — see README)'),
});

// POST /api/admin/election — create election with candidates
router.post('/election', async (req, res, next) => {
  try {
    const body = createElectionSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Invalid election data', details: body.error.flatten() });
      return;
    }

    const { title, candidates } = body.data;

    // Ensure no duplicate slots
    const slots = candidates.map(c => c.slot);
    if (new Set(slots).size !== slots.length) {
      res.status(400).json({ error: 'Candidate slots must be unique (0-3)' });
      return;
    }

    // Reset all voters so they can vote in the new election
    await prisma.voter.updateMany({
      where: { role: 'VOTER' },
      data: { hasVoted: false, lockedUntil: null, voteSessionExpiresAt: null },
    });

    const election = await prisma.election.create({
      data: {
        title,
        candidates: {
          create: candidates.map(c => ({ name: c.name, slot: c.slot })),
        },
      },
      include: { candidates: { orderBy: { slot: 'asc' } } },
    });

    res.status(201).json(election);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/election/current — get current election info
router.get('/election/current', async (req, res, next) => {
  try {
    const election = await prisma.election.findFirst({
      include: { candidates: { orderBy: { slot: 'asc' } } },
      orderBy: [{ openedAt: 'desc' }, { closedAt: 'desc' }],
    });
    if (!election) {
      res.status(404).json({ error: 'No election found' });
      return;
    }
    res.json(election);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/election/:id/status — SETUP→OPEN→CLOSED only, never backwards
const statusSchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']),
});

const VALID_TRANSITIONS: Record<string, string> = {
  SETUP: 'OPEN',
  OPEN:  'CLOSED',
};

router.patch('/election/:id/status', async (req, res, next) => {
  try {
    const body = statusSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Status must be OPEN or CLOSED' });
      return;
    }

    const election = await prisma.election.findUnique({ where: { id: req.params.id } });
    if (!election) {
      res.status(404).json({ error: 'Election not found' });
      return;
    }

    const allowed = VALID_TRANSITIONS[election.status];
    if (allowed !== body.data.status) {
      res.status(409).json({
        error: `Invalid transition: ${election.status} → ${body.data.status}. Allowed: ${election.status} → ${allowed ?? '(none — election is closed)'}`,
      });
      return;
    }

    const now = new Date();
    const updated = await prisma.election.update({
      where: { id: req.params.id },
      data: {
        status: body.data.status,
        openedAt:  body.data.status === 'OPEN'   ? now : undefined,
        closedAt:  body.data.status === 'CLOSED' ? now : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/audit — paginated audit log
router.get('/audit', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/turnout — voter count vs hasVoted (no per-voter choices)
router.get('/turnout', async (req, res, next) => {
  try {
    const [total, voted] = await Promise.all([
      prisma.voter.count({ where: { role: 'VOTER' } }),
      prisma.voter.count({ where: { role: 'VOTER', hasVoted: true } }),
    ]);

    res.json({
      total,
      voted,
      notVoted: total - voted,
      percentage: total > 0 ? ((voted / total) * 100).toFixed(1) : '0.0',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
