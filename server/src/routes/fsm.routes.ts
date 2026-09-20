import { Router } from 'express';
import { z } from 'zod';
import { requireVoter } from '../middleware/auth.middleware';
import { fsmStep } from '../fsm/engine';

const router = Router();

const buttonsSchema = z.object({
  buttons: z.array(z.boolean()).length(4),
});

// GET /api/fsm/state — read-only, no tick
router.get('/state', requireVoter, async (req, res, next) => {
  try {
    const result = await fsmStep(req.user.sub, { type: 'read' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/fsm/enable — tick with EN=1 (if conditions allow)
router.post('/enable', requireVoter, async (req, res, next) => {
  try {
    const result = await fsmStep(req.user.sub, { type: 'enable' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/fsm/press — body: { buttons: [bool,bool,bool,bool] }
// Takes the raw 4-bit button vector — priority encoder resolves server-side.
// A client sending all-true (or any multi-select) still gets exactly one vote.
router.post('/press', requireVoter, async (req, res, next) => {
  try {
    const body = buttonsSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: 'Body must be { buttons: [boolean, boolean, boolean, boolean] }',
        details: body.error.flatten(),
      });
      return;
    }
    const buttons = body.data.buttons as [boolean, boolean, boolean, boolean];
    const result = await fsmStep(req.user.sub, { type: 'press', buttons });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/fsm/ack — tick with ACK=1, drives S3→S0
router.post('/ack', requireVoter, async (req, res, next) => {
  try {
    const result = await fsmStep(req.user.sub, { type: 'ack' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
