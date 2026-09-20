import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/results — tallies ONLY if election is CLOSED; 403 otherwise (for any role)
router.get('/results', async (req, res, next) => {
  try {
    const election = await prisma.election.findFirst({
      where: { status: 'CLOSED' },
      include: { candidates: { orderBy: { slot: 'asc' } } },
      orderBy: { closedAt: 'desc' },
    });

    if (!election) {
      res.status(403).json({
        error: 'Results are not available. The election has not closed yet.',
      });
      return;
    }

    const totalVotes = election.candidates.reduce((sum, c) => sum + c.tally, 0);
    const winner = election.candidates.reduce((best, c) => (c.tally > best.tally ? c : best), election.candidates[0]);

    res.json({
      election: {
        id: election.id,
        title: election.title,
        closedAt: election.closedAt,
        totalVotes,
      },
      candidates: election.candidates.map(c => ({
        id: c.id,
        name: c.name,
        slot: c.slot,
        tally: c.tally,
        percentage: totalVotes > 0 ? ((c.tally / totalVotes) * 100).toFixed(1) : '0.0',
        isWinner: c.id === winner?.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
