/**
 * engine.ts — FSMEngine.step(): the ONLY transactional entry point
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SECURITY BANNER
 * This is the ONLY file in the codebase permitted to call:
 *   - prisma.candidate.update  (Candidate.tally increment)
 *   - prisma.ballot.create     (Ballot row insertion)
 *   - prisma.voter.update      (Voter.hasVoted flag)
 * Any other file performing these operations is a critical security violation.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Clocking model (one API request = one clock tick):
 *   1. Read (Q1, Q0, latch) inside a Serializable transaction with row lock.
 *   2. Compute EN, V, SEL, ACK from the action + current latch.
 *   3. Compute (Q1_next, Q0_next) via nextState() Boolean equations.
 *   4. If next state = S2_LOCKED, execute the commit critical section.
 *   5. Immediately advance S2→S3 within the same request (unconditional tick).
 *   6. Persist new state, write audit log row(s), commit.
 *   7. Return FsmStepResult.
 */

import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import type { Bit } from './gates';
import { nextState } from './nextState';
import { mooreOutputs, type MooreOutputs } from './outputs';
import { priorityEncode } from './priorityEncoder';
import { decode2to4 } from './decoder';
import { SRLatch } from './srLatch';
import { S2_LOCKED, S3_CONFIRM, encodeState, STATE_NAMES, type StateCode } from './states';
import { prisma } from '../lib/prisma';

// ── Public types ──────────────────────────────────────────────────────────────

export interface FsmStepResult {
  state: { q1: 0|1; q0: 0|1; code: StateCode; name: string };
  outputs: MooreOutputs;
  latch: boolean;
  selSlot: number | null;
  election: { id: string; title: string; status: string };
  candidates: { id: string; name: string; slot: number }[];
  note?: string;
}

export type FsmAction =
  | { type: 'enable' }
  | { type: 'press'; buttons: [boolean, boolean, boolean, boolean] }
  | { type: 'ack' }
  | { type: 'read' };

// ── Raw session row type returned by SELECT FOR UPDATE ────────────────────────
interface RawSession {
  id: string;
  voterId: string;
  electionId: string;
  q1: number;
  q0: number;
  latch: boolean;
  selSlot: number | null;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function fsmStep(voterId: string, action: FsmAction): Promise<FsmStepResult> {
  // Read-only path: no transaction needed
  if (action.type === 'read') {
    return readState(voterId);
  }

  return prisma.$transaction(
    async (tx) => {
      // ── 1. Find the active election ───────────────────────────────────────
      const election = await tx.election.findFirst({
        where: { status: { in: ['OPEN', 'SETUP'] } },
        include: { candidates: { orderBy: { slot: 'asc' } } },
        orderBy: { openedAt: 'desc' },
      });

      if (!election) {
        throw Object.assign(new Error('No active election found'), { code: 'NO_ELECTION' });
      }

      // ── 2. Ensure session row exists (upsert no-op) ───────────────────────
      await tx.votingSession.upsert({
        where: { voterId },
        create: { voterId, electionId: election.id, q1: 0, q0: 0, latch: false, selSlot: null },
        update: {},  // no-op: do not overwrite existing session
      });

      // ── 3. Lock the session row (SELECT ... FOR UPDATE) ───────────────────
      const [rawSession] = await tx.$queryRaw<RawSession[]>`
        SELECT id, "voterId", "electionId", q1, q0, latch, "selSlot"
        FROM "VotingSession"
        WHERE "voterId" = ${voterId}
        LIMIT 1
        FOR UPDATE
      `;

      const voter = await tx.voter.findUniqueOrThrow({ where: { id: voterId } });
      const now = new Date();
      if (voter.role === 'VOTER' && voter.voteSessionExpiresAt && now > voter.voteSessionExpiresAt && !voter.hasVoted) {
        // Time expired! Lock them out.
        const penaltyEnd = new Date(voter.voteSessionExpiresAt.getTime() + 20 * 60000);
        await tx.voter.update({
          where: { id: voterId },
          data: { lockedUntil: penaltyEnd, voteSessionExpiresAt: null }
        });
        throw Object.assign(new Error('Your 3-minute voting window has expired. You are locked out for 20 minutes.'), { code: 'VOTING_TIMEOUT' });
      }

      const fullElection = await tx.election.findUniqueOrThrow({
        where: { id: rawSession.electionId },
        include: { candidates: { orderBy: { slot: 'asc' } } },
      });

      const q1 = rawSession.q1 as Bit;
      const q0 = rawSession.q0 as Bit;
      const prevStateCode = encodeState(q1, q0);

      // ── 4. Reconstruct SR latch from persisted value ──────────────────────
      const latch = SRLatch.fromPersisted(rawSession.latch);

      // ── 5. Compute FSM inputs from action ─────────────────────────────────
      let EN: Bit = 0;
      let V: Bit  = 0;
      let SEL: 0|1|2|3 = 0;
      let ACK: Bit = 0;
      let note: string | undefined;

      if (action.type === 'enable') {
        if (fullElection.status === 'OPEN' && !voter.hasVoted) {
          latch.set();  // SR latch SET — voter authorized
        } else if (voter.hasVoted) {
          note = 'Voter has already voted; EN=0, state unchanged.';
        } else {
          note = `Election is ${fullElection.status}; EN=0, state unchanged.`;
        }
        EN = latch.Q;

      } else if (action.type === 'press') {
        const bits = action.buttons.map(b => (b ? 1 : 0)) as [Bit, Bit, Bit, Bit];
        const encoded = priorityEncode(bits);
        V   = encoded.V;
        SEL = encoded.sel;
        EN  = latch.Q;

      } else if (action.type === 'ack') {
        ACK = 1;
        EN  = latch.Q;
      }

      // ── 6. Compute next state via Boolean equations ───────────────────────
      const [nq1, nq0] = nextState(q1, q0, EN, V, ACK);
      let newStateCode = encodeState(nq1, nq0);

      if (newStateCode === prevStateCode && !note) {
        note = `Input '${action.type}' produced no state change from ${STATE_NAMES[prevStateCode]}.`;
      }

      // ── 7. Commit critical section (S2_LOCKED) ────────────────────────────
      let selSlot = rawSession.selSlot;
      let commitFlag = false;

      if (newStateCode === S2_LOCKED) {
        // ── Re-verify inside the same serializable transaction ─────────────
        if (voter.hasVoted) {
          // Force to S0, clear latch — return an error
          latch.reset();
          await tx.votingSession.update({
            where: { id: rawSession.id },
            data: { q1: 0, q0: 0, latch: false, selSlot: null },
          });
          throw Object.assign(
            new Error('ALREADY_VOTED: vote rejected inside serializable commit transaction'),
            { code: 'ALREADY_VOTED' }
          );
        }
        if (fullElection.status !== 'OPEN') {
          throw Object.assign(
            new Error('ELECTION_CLOSED: cannot commit vote to a closed election'),
            { code: 'ELECTION_CLOSED' }
          );
        }

        // Candidate selection via decoder
        selSlot = SEL;
        const candidate = fullElection.candidates.find(c => c.slot === selSlot);
        if (!candidate) {
          throw new Error(`No candidate registered in slot ${selSlot}`);
        }
        // Verify decoder output matches selected slot
        const decoded = decode2to4(selSlot as 0|1|2|3);
        console.assert(decoded[selSlot] === 1, 'Decoder mismatch — should never happen');

        // 1. Increment tally (ONLY HERE — see security banner)
        await tx.candidate.update({
          where: { id: candidate.id },
          data: { tally: { increment: 1 } },
        });

        // 2. Insert anonymous Ballot row (NO voter reference — ANONYMITY RULE)
        await tx.ballot.create({
          data: { electionId: fullElection.id, candidateId: candidate.id },
        });

        // 3. Set hasVoted = true (ONLY HERE — see security banner)
        await tx.voter.update({
          where: { id: voterId },
          data: { hasVoted: true },
        });

        // 4. Reset SR latch (vote committed, voter cannot re-enable)
        latch.reset();

        commitFlag = true;

        const createAuditLog = async (data: any) => {
          const lastLog = await tx.auditLog.findFirst({ orderBy: { createdAt: 'desc' } });
          const prevHash = lastLog?.hash || null;
          const hashObj = crypto.createHash('sha256');
          hashObj.update(prevHash || 'GENESIS');
          hashObj.update(data.electionId);
          hashObj.update(data.fromState.toString());
          hashObj.update(data.toState.toString());
          hashObj.update(data.inputsJson);
          hashObj.update(data.commitFlag.toString());
          const hash = hashObj.digest('hex');
          return tx.auditLog.create({ data: { ...data, prevHash, hash } });
        };

        // 5. Write S2 audit row (evidence commit happened in the commit state)
        await createAuditLog({
          electionId: rawSession.electionId,
          fromState: prevStateCode,
          toState: S2_LOCKED,
          inputsJson: JSON.stringify({ EN, V, SEL, ACK }),
          commitFlag: true,
        });

        // 6. Immediately advance S2→S3 (unconditional transition)
        //    nextState(1, 0, 0, 0, 0) always yields (1, 1) = S3
        const [s3q1, s3q0] = nextState(1, 0, 0, 0, 0);
        const s3Code = encodeState(s3q1, s3q0); // always S3_CONFIRM = 3

        // 7. Write S2→S3 audit row
        await createAuditLog({
          electionId: rawSession.electionId,
          fromState: S2_LOCKED,
          toState: s3Code,
          inputsJson: JSON.stringify({ EN: 0, V: 0, SEL: 0, ACK: 0 }),
          commitFlag: false,
        });

        // 8. Persist S3 state
        await tx.votingSession.update({
          where: { id: rawSession.id },
          data: { q1: s3q1, q0: s3q0, latch: false, selSlot },
        });

        return buildResponse(s3q1, s3q0, latch, selSlot, fullElection, note);
      }

      // ── 8. Persist non-commit state ──────────────────────────────────────────
      await tx.votingSession.update({
        where: { id: rawSession.id },
        data: { q1: nq1, q0: nq0, latch: latch.Q === 1, selSlot },
      });

      // ── 9. Write audit log for every tick ──────────────────────────────────
      const createAuditLog2 = async (data: any) => {
        const lastLog = await tx.auditLog.findFirst({ orderBy: { createdAt: 'desc' } });
        const prevHash = lastLog?.hash || null;
        const hashObj = crypto.createHash('sha256');
        hashObj.update(prevHash || 'GENESIS');
        hashObj.update(data.electionId);
        hashObj.update(data.fromState.toString());
        hashObj.update(data.toState.toString());
        hashObj.update(data.inputsJson);
        hashObj.update(data.commitFlag.toString());
        const hash = hashObj.digest('hex');
        return tx.auditLog.create({ data: { ...data, prevHash, hash } });
      };

      await createAuditLog2({
        electionId: rawSession.electionId,
        fromState: prevStateCode,
        toState: newStateCode,
        inputsJson: JSON.stringify({ EN, V, SEL, ACK }),
        commitFlag: false,
      });

      return buildResponse(nq1, nq0, latch, selSlot, fullElection, note);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    }
  );
}

// ── Read-only path ────────────────────────────────────────────────────────────

async function readState(voterId: string): Promise<FsmStepResult> {
  // Find most-recently-touched election (open, or last closed)
  const election = await prisma.election.findFirst({
    where: {},
    include: { candidates: { orderBy: { slot: 'asc' } } },
    orderBy: [{ openedAt: 'desc' }, { closedAt: 'desc' }],
  });

  if (!election) {
    throw Object.assign(new Error('No election found'), { code: 'NO_ELECTION' });
  }

  const voter = await prisma.voter.findUnique({ where: { id: voterId } });
  const session = await prisma.votingSession.findUnique({ where: { voterId } });
  const q1 = (session?.q1 ?? 0) as Bit;
  const q0 = (session?.q0 ?? 0) as Bit;
  const latch = SRLatch.fromPersisted(session?.latch ?? false);
  const selSlot = session?.selSlot ?? null;

  let note = undefined;
  if (voter?.hasVoted) {
    note = 'Voter has already voted; EN=0, state unchanged.';
  } else if (election.status !== 'OPEN') {
    note = `Election is ${election.status}; EN=0, state unchanged.`;
  }

  return buildResponse(q1, q0, latch, selSlot, election, note);
}

// ── Response builder ──────────────────────────────────────────────────────────

type ElectionWithCandidates = {
  id: string;
  title: string;
  status: string;
  candidates: { id: string; name: string; slot: number; tally: number }[];
};

function buildResponse(
  q1: Bit,
  q0: Bit,
  latch: SRLatch,
  selSlot: number | null,
  election: ElectionWithCandidates,
  note?: string
): FsmStepResult {
  const code = encodeState(q1, q0);
  const outputs = mooreOutputs(q1, q0);

  return {
    state: { q1, q0, code, name: STATE_NAMES[code] },
    outputs,
    latch: latch.Q === 1,
    selSlot,
    election: { id: election.id, title: election.title, status: election.status },
    // NEVER include tallies while election is OPEN — only candidate metadata
    candidates: election.candidates.map(c => ({
      id: c.id,
      name: c.name,
      slot: c.slot,
    })),
    ...(note ? { note } : {}),
  };
}
