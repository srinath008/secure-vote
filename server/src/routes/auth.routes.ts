import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

// Rate limiter: 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  rollNumber: z.string().min(3).max(20),
  name:       z.string().min(1).max(100),
  password:   z.string().min(6),
});

const loginSchema = z.object({
  rollNumber: z.string(),
  password:   z.string(),
});

// POST /api/auth/register
// Disabled in production unless ALLOW_SELF_REGISTER=true
router.post('/register', async (req, res, next) => {
  try {
    if (process.env.ALLOW_SELF_REGISTER !== 'true') {
      res.status(403).json({ error: 'Self-registration is disabled. Contact admin for access.' });
      return;
    }

    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Invalid input', details: body.error.flatten() });
      return;
    }

    const { rollNumber, name, password } = body.data;
    const exists = await prisma.voter.findUnique({ where: { rollNumber } });
    if (exists) {
      res.status(409).json({ error: 'Roll number already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const voter = await prisma.voter.create({
      data: { rollNumber, name, passwordHash },
      select: { id: true, rollNumber: true, name: true, role: true },
    });

    res.status(201).json(voter);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Roll number and password required' });
      return;
    }

    const { rollNumber, password } = body.data;
    let voter = await prisma.voter.findUnique({ where: { rollNumber } });
    if (!voter) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, voter.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // --- Reject login if already voted ---
    if (voter.role === 'VOTER' && voter.hasVoted) {
      res.status(403).json({ error: 'You have already cast your vote. Multiple logins are not permitted.' });
      return;
    }

    // --- Security Window Logic for Voters ---
    if (voter.role === 'VOTER') {
      const now = new Date();
      
      // 1. Check if they are locked out
      if (voter.lockedUntil && voter.lockedUntil > now) {
        res.status(403).json({ 
          error: `Account is locked until ${voter.lockedUntil.toLocaleTimeString()} due to voting timeout. Please try again later.` 
        });
        return;
      }

      // 2. Check if their previous session expired without voting
      if (voter.voteSessionExpiresAt && voter.voteSessionExpiresAt < now && !voter.hasVoted) {
        // They missed the previous 3-minute window! Lock them out.
        const penaltyEnd = new Date(voter.voteSessionExpiresAt.getTime() + 20 * 60000);
        if (now < penaltyEnd) {
          await prisma.voter.update({
            where: { id: voter.id },
            data: { lockedUntil: penaltyEnd }
          });
          res.status(403).json({ 
            error: `You missed your voting window. Account locked until ${penaltyEnd.toLocaleTimeString()}.` 
          });
          return;
        }
      }

      // 3. Grant a new 3-minute window if they haven't voted yet
      if (!voter.hasVoted) {
        const expiresAt = new Date(now.getTime() + 3 * 60000); // 3 minutes
        voter = await prisma.voter.update({
          where: { id: voter.id },
          data: { 
            voteSessionExpiresAt: expiresAt,
            lockedUntil: null // Clear any old locks
          }
        });
      }
    }
    // ----------------------------------------

    const token = jwt.sign(
      { sub: voter.id, role: voter.role, name: voter.name },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
      })
      .json({ id: voter.id, name: voter.name, role: voter.role });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ message: 'Logged out' });
});

// GET /api/auth/me — returns current user info from cookie
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; role: string; name: string };
    res.json({ id: payload.sub, role: payload.role, name: payload.name });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
