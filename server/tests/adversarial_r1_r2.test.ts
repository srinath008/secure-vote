/**
 * adversarial_r1_r2.test.ts
 *
 * Empirical adversarial stress testing for:
 *   R1: Secure Real-Time Results (Data Leak Prevention)
 *   R2: Strict Role Segregation (FSM Lockout for Admins & Unauthorized Roles)
 *
 * Written by challenger_1.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import jwt from 'jsonwebtoken';

import adminRoutes from '../src/routes/admin.routes';
import fsmRoutes from '../src/routes/fsm.routes';
import electionRoutes from '../src/routes/election.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { requireVoter, requireAdmin } from '../src/middleware/auth.middleware';
import { prisma } from '../src/lib/prisma';
import * as fsmEngine from '../src/fsm/engine';

const JWT_SECRET = process.env.JWT_SECRET || 'b1938d35b013327effa46093bbf808f3fece94e3a049b6aa72230d68d02fd5b4e393335c6f66dd2af670878067f2d74872aa0eff344662c1936f253f3e398683';

describe('Adversarial Challenge R1: Secure Real-Time Results (Data Leak)', () => {
  let app: express.Express;
  let server: http.Server;
  let port: number;
  let adminToken: string;
  let voterToken: string;

  beforeEach(async () => {
    adminToken = jwt.sign(
      { sub: 'admin-adversary-01', role: 'ADMIN', name: 'Security Admin' },
      JWT_SECRET
    );
    voterToken = jwt.sign(
      { sub: 'voter-adversary-01', role: 'VOTER', name: 'Attacker Voter' },
      JWT_SECRET
    );

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin', adminRoutes);
    app.use('/api', electionRoutes);
    app.use(errorMiddleware);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('R1-ADV-01: Admin GET /api/admin/election/current with election OPEN suppresses tally on all candidates', async () => {
    const mockElection = {
      id: 'elect-open-999',
      title: 'General Election 2026',
      status: 'OPEN',
      openedAt: new Date('2026-09-20T10:00:00Z'),
      closedAt: null,
      candidates: [
        { id: 'c1', electionId: 'elect-open-999', name: 'Candidate Zero', slot: 0, tally: 0 },
        { id: 'c2', electionId: 'elect-open-999', name: 'Candidate Low', slot: 1, tally: 1 },
        { id: 'c3', electionId: 'elect-open-999', name: 'Candidate Mid', slot: 2, tally: 543 },
        { id: 'c4', electionId: 'elect-open-999', name: 'Candidate High', slot: 3, tally: 1000000 },
      ],
    };

    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(mockElection as any);

    const res = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    // Raw JSON string must not contain "tally" key anywhere in candidate records
    expect(text).not.toContain('"tally"');

    const body = JSON.parse(text);
    expect(body.id).toBe('elect-open-999');
    expect(body.status).toBe('OPEN');
    expect(body.candidates).toHaveLength(4);

    for (const c of body.candidates) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('slot');
      expect(c).not.toHaveProperty('tally');
      expect('tally' in c).toBe(false);
      expect(c.tally).toBeUndefined();
    }
  });

  it('R1-ADV-02: Admin GET /api/admin/election/current with cookie authentication also suppresses tally', async () => {
    const mockElection = {
      id: 'elect-open-cookie',
      title: 'Cookie Auth Election',
      status: 'OPEN',
      openedAt: new Date(),
      closedAt: null,
      candidates: [
        { id: 'c1', electionId: 'elect-open-cookie', name: 'Alice', slot: 0, tally: 120 },
      ],
    };

    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(mockElection as any);

    const res = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Cookie: `token=${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates[0]).not.toHaveProperty('tally');
    expect(JSON.stringify(body)).not.toContain('"tally"');
  });

  it('R1-ADV-03: Parameter pollution / query injection attempts do NOT leak tallies', async () => {
    const mockElection = {
      id: 'elect-open-bypass',
      title: 'Bypass Resistance Election',
      status: 'OPEN',
      openedAt: new Date(),
      closedAt: null,
      candidates: [
        { id: 'c1', electionId: 'elect-open-bypass', name: 'Alice', slot: 0, tally: 999 },
      ],
    };

    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(mockElection as any);

    const maliciousQueries = [
      '?status=CLOSED',
      '?status=closed',
      '?include=tally',
      '?select=tally,name,slot',
      '?raw=true',
      '?debug=1',
      '?format=all',
      '?candidates[tally]=true',
    ];

    for (const q of maliciousQueries) {
      const res = await fetch(`http://localhost:${port}/api/admin/election/current${q}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('OPEN');
      expect(body.candidates[0]).not.toHaveProperty('tally');
      expect(JSON.stringify(body)).not.toContain('"tally"');
    }
  });

  it('R1-ADV-04: Boundary condition: Election OPEN with 0 candidates handles gracefully without error or leak', async () => {
    const mockElection = {
      id: 'elect-open-empty',
      title: 'Empty Candidates Election',
      status: 'OPEN',
      openedAt: new Date(),
      closedAt: null,
      candidates: [],
    };

    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(mockElection as any);

    const res = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('"tally"');
  });

  it('R1-ADV-05: Non-admin users cannot access GET /api/admin/election/current', async () => {
    // 1. Voter token
    const resVoter = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    expect(resVoter.status).toBe(403);
    const bodyVoter = await resVoter.json();
    expect(bodyVoter.error).toBe('Admin access required');

    // 2. Unauthenticated (no token)
    const resUnauth = await fetch(`http://localhost:${port}/api/admin/election/current`);
    expect(resUnauth.status).toBe(401);
    const bodyUnauth = await resUnauth.json();
    expect(bodyUnauth.error).toBe('Not authenticated');

    // 3. Invalid / forged token
    const fakeToken = jwt.sign({ sub: 'attacker', role: 'ADMIN' }, 'wrong-secret');
    const resFake = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(resFake.status).toBe(401);
    const bodyFake = await resFake.json();
    expect(bodyFake.error).toBe('Invalid or expired token');

    // 4. Unknown role token
    const auditorToken = jwt.sign({ sub: 'auditor', role: 'AUDITOR' }, JWT_SECRET);
    const resAuditor = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(resAuditor.status).toBe(403);
    const bodyAuditor = await resAuditor.json();
    expect(bodyAuditor.error).toBe('Admin access required');
  });

  it('R1-ADV-06: Preserves tallies when election is CLOSED or SETUP (post-election auditability)', async () => {
    // Status CLOSED
    const closedElection = {
      id: 'elect-closed',
      title: 'Finished Election',
      status: 'CLOSED',
      openedAt: new Date(),
      closedAt: new Date(),
      candidates: [{ id: 'c1', name: 'Winner', slot: 0, tally: 777 }],
    };
    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(closedElection as any);

    const resClosed = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resClosed.status).toBe(200);
    const bodyClosed = await resClosed.json();
    expect(bodyClosed.candidates[0].tally).toBe(777);

    // Status SETUP
    const setupElection = {
      id: 'elect-setup',
      title: 'Upcoming Election',
      status: 'SETUP',
      openedAt: null,
      closedAt: null,
      candidates: [{ id: 'c1', name: 'Contender', slot: 0, tally: 0 }],
    };
    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(setupElection as any);

    const resSetup = await fetch(`http://localhost:${port}/api/admin/election/current`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resSetup.status).toBe(200);
    const bodySetup = await resSetup.json();
    expect(bodySetup.candidates[0].tally).toBe(0);
  });

  it('R1-ADV-07: Cross-endpoint check — /api/results blocks tally leaks while election is OPEN', async () => {
    // When no election is CLOSED (e.g. only OPEN exists)
    vi.spyOn(prisma.election, 'findFirst').mockResolvedValue(null);

    const res = await fetch(`http://localhost:${port}/api/results`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Results are not available. The election has not closed yet.');
  });
});

describe('Adversarial Challenge R2: Strict Role Segregation on FSM Endpoints', () => {
  let app: express.Express;
  let server: http.Server;
  let port: number;
  let adminToken: string;
  let voterToken: string;

  beforeEach(async () => {
    adminToken = jwt.sign(
      { sub: 'admin-user-01', role: 'ADMIN', name: 'Admin Challenger' },
      JWT_SECRET
    );
    voterToken = jwt.sign(
      { sub: 'voter-user-01', role: 'VOTER', name: 'Legitimate Voter' },
      JWT_SECRET
    );

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/fsm', fsmRoutes);
    app.use(errorMiddleware);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const fsmEndpoints: { method: 'GET' | 'POST'; path: string; body?: any }[] = [
    { method: 'GET',  path: '/api/fsm/state' },
    { method: 'POST', path: '/api/fsm/enable' },
    { method: 'POST', path: '/api/fsm/press', body: { buttons: [true, false, false, false] } },
    { method: 'POST', path: '/api/fsm/ack' },
  ];

  for (const ep of fsmEndpoints) {
    it(`R2-ADV-01: Admin JWT via Bearer Header receives 403 on ${ep.method} ${ep.path}`, async () => {
      const stepSpy = vi.spyOn(fsmEngine, 'fsmStep');

      const res = await fetch(`http://localhost:${port}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: 'Admins cannot interact with voting machine' });
      expect(stepSpy).not.toHaveBeenCalled();
    });

    it(`R2-ADV-02: Admin JWT via Cookie receives 403 on ${ep.method} ${ep.path}`, async () => {
      const stepSpy = vi.spyOn(fsmEngine, 'fsmStep');

      const res = await fetch(`http://localhost:${port}${ep.path}`, {
        method: ep.method,
        headers: {
          Cookie: `token=${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: 'Admins cannot interact with voting machine' });
      expect(stepSpy).not.toHaveBeenCalled();
    });

    it(`R2-ADV-03: Missing authentication token receives 401 on ${ep.method} ${ep.path}`, async () => {
      const stepSpy = vi.spyOn(fsmEngine, 'fsmStep');

      const res = await fetch(`http://localhost:${port}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not authenticated' });
      expect(stepSpy).not.toHaveBeenCalled();
    });

    it(`R2-ADV-04: Malformed or invalid JWT receives 401 on ${ep.method} ${ep.path}`, async () => {
      const stepSpy = vi.spyOn(fsmEngine, 'fsmStep');

      const testTokens = [
        'Bearer gibberish.token.payload',
        'Bearer ',
        'Basic dXNlcjpwYXNz',
      ];

      for (const authHeader of testTokens) {
        const res = await fetch(`http://localhost:${port}${ep.path}`, {
          method: ep.method,
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: ep.body ? JSON.stringify(ep.body) : undefined,
        });

        // If 'Bearer ' with empty string or Basic scheme, extractToken returns null -> 401 'Not authenticated'
        // If gibberish jwt string, jwt.verify throws -> 401 'Invalid or expired token'
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(['Not authenticated', 'Invalid or expired token']).toContain(body.error);
        expect(stepSpy).not.toHaveBeenCalled();
      }
    });

    it(`R2-ADV-05: Non-voter / unknown roles receive 403 on ${ep.method} ${ep.path}`, async () => {
      const stepSpy = vi.spyOn(fsmEngine, 'fsmStep');

      const adversarialRoles = [
        'AUDITOR',
        'OBSERVER',
        'SUPERADMIN',
        'OPERATOR',
        'admin',       // lowercase role bypass attempt
        'voter',       // lowercase role bypass attempt
        '',            // empty role
        'GUEST',
      ];

      for (const role of adversarialRoles) {
        const customToken = jwt.sign(
          { sub: `user-${role}`, role: role as any, name: `User ${role}` },
          JWT_SECRET
        );

        const res = await fetch(`http://localhost:${port}${ep.path}`, {
          method: ep.method,
          headers: {
            Authorization: `Bearer ${customToken}`,
            'Content-Type': 'application/json',
          },
          body: ep.body ? JSON.stringify(ep.body) : undefined,
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        // If role === 'ADMIN', specific message; for any other non-VOTER, 'Voter access required'
        expect(body).toEqual({ error: 'Voter access required' });
        expect(stepSpy).not.toHaveBeenCalled();
      }
    });

    it(`R2-ADV-06: Valid voter token allows access on ${ep.method} ${ep.path}`, async () => {
      const mockResult: any = {
        state: { q1: 0, q0: 1, code: 1, name: 'S1_ENABLED' },
        outputs: { enableLED: true, confirmLED: false, readyLED: false, buzzer: false },
        latch: true,
        selSlot: null,
        election: { id: 'e1', title: 'Test', status: 'OPEN' },
        candidates: [],
      };

      vi.spyOn(fsmEngine, 'fsmStep').mockResolvedValue(mockResult);

      const res = await fetch(`http://localhost:${port}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${voterToken}`,
          'Content-Type': 'application/json',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state.name).toBe('S1_ENABLED');
    });
  }

  it('R2-ADV-07: Token confusion / precedence — Cookie admin token blocks even if Header voter token provided', async () => {
    const stepSpy = vi.spyOn(fsmEngine, 'fsmStep');

    // Attacker sends cookie=adminToken AND header=voterToken
    const res = await fetch(`http://localhost:${port}/api/fsm/state`, {
      headers: {
        Cookie: `token=${adminToken}`,
        Authorization: `Bearer ${voterToken}`,
      },
    });

    // Since cookie is primary in extractToken, admin role is resolved and blocked
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Admins cannot interact with voting machine' });
    expect(stepSpy).not.toHaveBeenCalled();
  });
});
