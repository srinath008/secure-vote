import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { fsmStep } from '../src/fsm/engine';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import http from 'http';
import { execSync } from 'child_process';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
  error?: any;
}

const results: TestResult[] = [];

function record(suite: string, name: string, passed: boolean, details?: string, error?: any) {
  results.push({ suite, name, passed, details, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${suite}] ${name}${details ? ` -> ${details}` : ''}`);
  if (error) {
    console.error('   Error details:', error);
  }
}

// Robust retry wrapper for serialization conflicts under Serializable isolation
async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 8): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const isSerializationConflict =
        err?.code === 'P2034' ||
        (err?.message && err.message.includes('Transaction failed due to a write conflict or a deadlock'));
      if (isSerializationConflict && attempt < maxRetries) {
        const backoffMs = Math.floor(50 * Math.pow(1.5, attempt) + Math.random() * 80);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function runR3ConcurrencyAndChainTests() {
  console.log('\n======================================================');
  console.log('⚡ REQUIREMENT R3: CRYPTOGRAPHIC CHAIN INTEGRITY & CONCURRENCY');
  console.log('======================================================');

  // 1. Check Schema properties
  try {
    const rawCols = await prisma.$queryRaw<any[]>`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'AuditLog' AND column_name = 'logIndex'
    `;
    const hasLogIndex = rawCols.length > 0;
    record('R3_SCHEMA', 'AuditLog has logIndex column in PostgreSQL', hasLogIndex, JSON.stringify(rawCols[0]));
  } catch (e: any) {
    record('R3_SCHEMA', 'AuditLog has logIndex column in PostgreSQL', false, e.message, e);
  }

  // Ensure an election exists and is OPEN
  let election = await prisma.election.findFirst({
    include: { candidates: { orderBy: { slot: 'asc' } } },
  });

  if (!election) {
    election = await prisma.election.create({
      data: {
        title: 'Challenger Stress Test Election 2026',
        status: 'OPEN',
        openedAt: new Date(),
        candidates: {
          create: [
            { name: 'Cand 0', slot: 0 },
            { name: 'Cand 1', slot: 1 },
            { name: 'Cand 2', slot: 2 },
            { name: 'Cand 3', slot: 3 },
          ],
        },
      },
      include: { candidates: { orderBy: { slot: 'asc' } } },
    });
  } else if (election.status !== 'OPEN') {
    election = await prisma.election.update({
      where: { id: election.id },
      data: { status: 'OPEN', openedAt: new Date(), closedAt: null },
      include: { candidates: { orderBy: { slot: 'asc' } } },
    });
  }

  // Clear existing audit logs and ballots for clean test baseline
  await prisma.ballot.deleteMany({ where: { electionId: election.id } });
  await prisma.auditLog.deleteMany({ where: { electionId: election.id } });

  // 2. Concurrent Voters Stress Test
  const numVoters = 6;
  const testVoterIds: string[] = [];
  for (let i = 1; i <= numVoters; i++) {
    const roll = `CHALL_VOTER_${i}_${Date.now()}`;
    const hash = await bcrypt.hash('pass123', 6);
    const v = await prisma.voter.create({
      data: {
        rollNumber: roll,
        name: `Challenger Voter ${i}`,
        passwordHash: hash,
        role: 'VOTER',
        hasVoted: false,
        voteSessionExpiresAt: new Date(Date.now() + 10 * 60000), // 10m window
      },
    });
    testVoterIds.push(v.id);
  }

  console.log(`Created ${numVoters} test voters. Firing concurrent FSM voting actions with retry...`);

  async function voteForCandidate(voterId: string, slot: 0 | 1 | 2 | 3) {
    try {
      // Step 1: Enable
      await executeWithRetry(() => fsmStep(voterId, { type: 'enable' }));
      // Step 2: Press candidate button
      const buttons: [boolean, boolean, boolean, boolean] = [false, false, false, false];
      buttons[slot] = true;
      await executeWithRetry(() => fsmStep(voterId, { type: 'press', buttons }));
      // Step 3: Ack
      await executeWithRetry(() => fsmStep(voterId, { type: 'ack' }));
      return { success: true, voterId };
    } catch (err: any) {
      return { success: false, voterId, error: err.message };
    }
  }

  // Execute all voters concurrently
  const votePromises = testVoterIds.map((id, idx) => voteForCandidate(id, (idx % 4) as 0 | 1 | 2 | 3));
  const voteResults = await Promise.all(votePromises);

  const successfulVotes = voteResults.filter((r) => r.success).length;
  console.log(`Concurrent voting completed: ${successfulVotes}/${numVoters} voters voted successfully.`);

  // 3. Directly test concurrent audit log appends
  console.log('Testing direct concurrent audit log generation...');
  const concurrentAppends = 8;
  const appendPromises = Array.from({ length: concurrentAppends }).map(async (_, idx) => {
    // Generate an audit log via a test voter state tick
    const dummyVoter = testVoterIds[idx % testVoterIds.length];
    try {
      await executeWithRetry(() =>
        fsmStep(dummyVoter, { type: 'press', buttons: [false, false, false, false] })
      );
      return true;
    } catch {
      return false;
    }
  });
  await Promise.all(appendPromises);

  // Now audit the AuditLog table!
  const logs = await prisma.auditLog.findMany({
    where: { electionId: election.id },
    orderBy: { logIndex: 'asc' },
  });

  console.log(`Total audit logs created during concurrent operations: ${logs.length}`);

  let chainBroken = false;
  let brokenReason = '';

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // Check 1: logIndex strictly monotonic
    if (i > 0 && log.logIndex <= logs[i - 1].logIndex) {
      chainBroken = true;
      brokenReason = `logIndex non-monotonic at index ${i}: prev=${logs[i - 1].logIndex}, cur=${log.logIndex}`;
      break;
    }

    // Check 2: prevHash pointer continuity
    if (i === 0) {
      if (log.prevHash !== null) {
        chainBroken = true;
        brokenReason = `First log prevHash is not null: ${log.prevHash}`;
        break;
      }
    } else {
      if (log.prevHash !== logs[i - 1].hash) {
        chainBroken = true;
        brokenReason = `Broken chain at logIndex ${log.logIndex}: cur.prevHash (${log.prevHash}) != prev.hash (${logs[i - 1].hash})`;
        break;
      }
    }

    // Check 3: Cryptographic integrity of hash calculation
    const hashObj = crypto.createHash('sha256');
    hashObj.update(log.prevHash || 'GENESIS');
    hashObj.update(log.electionId);
    hashObj.update(log.fromState.toString());
    hashObj.update(log.toState.toString());
    hashObj.update(log.inputsJson);
    hashObj.update(log.commitFlag.toString());
    const expectedHash = hashObj.digest('hex');

    if (log.hash !== expectedHash) {
      chainBroken = true;
      brokenReason = `Hash mismatch at logIndex ${log.logIndex}: expected ${expectedHash}, got ${log.hash}`;
      break;
    }
  }

  record(
    'R3_CONCURRENCY',
    'AuditLog hash chain maintains unbroken cryptographic continuity',
    !chainBroken && logs.length > 0,
    chainBroken ? brokenReason : `Validated ${logs.length} sequential cryptographically linked blocks with SHA-256 chain`
  );

  // Clean up test voters
  await prisma.votingSession.deleteMany({ where: { voterId: { in: testVoterIds } } });
  await prisma.voter.deleteMany({ where: { id: { in: testVoterIds } } });
}

async function runR4TimeoutResetAndLockoutTests() {
  console.log('\n======================================================');
  console.log('⚡ REQUIREMENT R4: ABANDONED SESSION STATE RESET & LOCKOUT');
  console.log('======================================================');

  let election = await prisma.election.findFirst({ where: { status: 'OPEN' } });
  if (!election) {
    election = await prisma.election.create({
      data: {
        title: 'Election R4 Test',
        status: 'OPEN',
        candidates: {
          create: [
            { name: 'Cand A', slot: 0 },
            { name: 'Cand B', slot: 1 },
          ],
        },
      },
    });
  }

  // Create test voter
  const roll = `R4_TIMEOUT_${Date.now()}`;
  const rawPass = 'voterpass123';
  const hash = await bcrypt.hash(rawPass, 6);
  const voter = await prisma.voter.create({
    data: {
      rollNumber: roll,
      name: 'R4 Timeout Voter',
      passwordHash: hash,
      role: 'VOTER',
      hasVoted: false,
    },
  });

  // Setup Express server for auth routes to test login behavior
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use(errorMiddleware);

  const server = http.createServer(app);
  let port = 0;
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });

  try {
    // 1. Put voter in S1 state (dirty session state) with an expired window
    console.log('Simulating voter in state S1 (q1=0, q0=1, latch=true, selSlot=1) whose 3-min window expired...');
    const expiredTime = new Date(Date.now() - 5000); // expired 5 seconds ago
    await prisma.voter.update({
      where: { id: voter.id },
      data: {
        voteSessionExpiresAt: expiredTime,
        lockedUntil: null,
      },
    });

    await prisma.votingSession.upsert({
      where: { voterId: voter.id },
      create: {
        voterId: voter.id,
        electionId: election.id,
        q1: 0,
        q0: 1,
        latch: true,
        selSlot: 1,
      },
      update: {
        q1: 0,
        q0: 1,
        latch: true,
        selSlot: 1,
      },
    });

    // Verify session is dirty before triggering timeout
    const preSession = await prisma.votingSession.findUniqueOrThrow({ where: { voterId: voter.id } });
    record(
      'R4_SETUP',
      'VotingSession initialized to dirty state (q0=1, latch=true, selSlot=1)',
      preSession.q0 === 1 && preSession.latch === true && preSession.selSlot === 1
    );

    // Call fsmStep
    let stepError: any = null;
    try {
      await fsmStep(voter.id, { type: 'press', buttons: [0, 1, 0, 0] });
    } catch (e: any) {
      stepError = e;
    }

    record(
      'R4_FSM_TIMEOUT',
      'fsmStep throws VOTING_TIMEOUT error',
      stepError && stepError.code === 'VOTING_TIMEOUT',
      stepError ? stepError.message : 'No error thrown'
    );

    // Verify database state after timeout
    const postSession = await prisma.votingSession.findUniqueOrThrow({ where: { voterId: voter.id } });
    const isReset =
      postSession.q1 === 0 &&
      postSession.q0 === 0 &&
      postSession.latch === false &&
      postSession.selSlot === null;

    record(
      'R4_RESET_STATE',
      'VotingSession explicitly reset to q1=0, q0=0, latch=false, selSlot=null in DB',
      isReset,
      `q1=${postSession.q1}, q0=${postSession.q0}, latch=${postSession.latch}, selSlot=${postSession.selSlot}`
    );

    const postVoter = await prisma.voter.findUniqueOrThrow({ where: { id: voter.id } });
    const expectedPenaltyEnd = new Date(expiredTime.getTime() + 20 * 60000);
    const diffMs = Math.abs((postVoter.lockedUntil?.getTime() || 0) - expectedPenaltyEnd.getTime());
    const isLockoutSet = postVoter.lockedUntil !== null && diffMs < 1000 && postVoter.voteSessionExpiresAt === null;

    record(
      'R4_LOCKOUT_PENALTY',
      'Voter locked out for 20 minutes (voteSessionExpiresAt=null, lockedUntil set)',
      isLockoutSet,
      `lockedUntil: ${postVoter.lockedUntil?.toISOString()}`
    );

    // 2. Test Login Attempt During 20-minute Lockout
    console.log('Testing login attempt during active 20-minute lockout...');
    const loginDuringLockout = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rollNumber: roll, password: rawPass }),
    });

    const lockoutBody = await loginDuringLockout.json();
    record(
      'R4_LOGIN_BLOCKED_DURING_LOCKOUT',
      'Login during lockout is rejected with HTTP 403',
      loginDuringLockout.status === 403 && lockoutBody.error.includes('Account is locked until'),
      `Status ${loginDuringLockout.status}: ${lockoutBody.error}`
    );

    // 3. Test Login Attempt After Lockout Expires
    console.log('Simulating passage of 20 minutes: setting lockedUntil into the past...');
    await prisma.voter.update({
      where: { id: voter.id },
      data: { lockedUntil: new Date(Date.now() - 5000) }, // lockout expired 5s ago
    });

    const loginAfterLockout = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rollNumber: roll, password: rawPass }),
    });

    const setCookieHeader = loginAfterLockout.headers.get('set-cookie');
    const hasTokenCookie = setCookieHeader !== null && setCookieHeader.includes('token=');
    record(
      'R4_LOGIN_PERMITTED_AFTER_LOCKOUT',
      'Login after lockout expiry succeeds with HTTP 200 and issues token cookie',
      loginAfterLockout.status === 200 && hasTokenCookie,
      `Status ${loginAfterLockout.status}, Set-Cookie: ${setCookieHeader ? 'present' : 'missing'}`
    );

    // Verify new 3-minute window was granted
    const voterAfterRelogin = await prisma.voter.findUniqueOrThrow({ where: { id: voter.id } });
    const hasNewWindow =
      voterAfterRelogin.voteSessionExpiresAt !== null &&
      voterAfterRelogin.voteSessionExpiresAt.getTime() > Date.now() &&
      voterAfterRelogin.lockedUntil === null;

    record(
      'R4_NEW_VOTING_WINDOW',
      'Voter granted fresh 3-minute window and lockout cleared upon re-login',
      hasNewWindow,
      `expiresAt: ${voterAfterRelogin.voteSessionExpiresAt?.toISOString()}`
    );

    // 4. Test physical EVM state after re-login
    console.log('Verifying physical EVM starts cleanly in S0_IDLE (q1: 0, q0: 0, latch: false)...');
    const evmState = await fsmStep(voter.id, { type: 'read' });
    const isCleanS0 =
      evmState.state.code === 0 &&
      evmState.state.name === 'S0_IDLE' &&
      evmState.state.q1 === 0 &&
      evmState.state.q0 === 0 &&
      evmState.latch === false &&
      evmState.selSlot === null;

    record(
      'R4_CLEAN_S0_STARTUP',
      'EVM is in clean S0_IDLE state (q1=0, q0=0, latch=false, selSlot=null)',
      isCleanS0,
      `State: ${evmState.state.name}, latch: ${evmState.latch}, selSlot: ${evmState.selSlot}`
    );

    // Verify EVM requires authorization (enable) before any candidate button press works
    console.log('Testing that pressing candidate button while in S0_IDLE (without enable) does NOT vote...');
    const pressWithoutEnable = await fsmStep(voter.id, { type: 'press', buttons: [1, 0, 0, 0] });
    const unauthRemainsS0 =
      pressWithoutEnable.state.code === 0 &&
      pressWithoutEnable.state.name === 'S0_IDLE' &&
      pressWithoutEnable.latch === false;

    record(
      'R4_REQUIRES_AUTHORIZATION',
      'EVM ignores button presses in S0_IDLE until authorized via enable action',
      unauthRemainsS0,
      `State remains ${pressWithoutEnable.state.name}, latch=${pressWithoutEnable.latch}`
    );

    // 5. Test readState timeout path
    console.log('Testing readState timeout detection on another voter...');
    const roll2 = `R4_READ_${Date.now()}`;
    const voter2 = await prisma.voter.create({
      data: {
        rollNumber: roll2,
        name: 'R4 ReadState Timeout Voter',
        passwordHash: hash,
        role: 'VOTER',
        hasVoted: false,
        voteSessionExpiresAt: new Date(Date.now() - 5000), // expired
      },
    });
    await prisma.votingSession.create({
      data: {
        voterId: voter2.id,
        electionId: election.id,
        q1: 0,
        q0: 1,
        latch: true,
        selSlot: 1,
      },
    });

    let readError: any = null;
    try {
      await fsmStep(voter2.id, { type: 'read' });
    } catch (e: any) {
      readError = e;
    }

    const session2 = await prisma.votingSession.findUniqueOrThrow({ where: { voterId: voter2.id } });
    const voter2Updated = await prisma.voter.findUniqueOrThrow({ where: { id: voter2.id } });

    record(
      'R4_READSTATE_TIMEOUT',
      'readState throws VOTING_TIMEOUT and resets session and locks out voter',
      readError?.code === 'VOTING_TIMEOUT' &&
        session2.q0 === 0 &&
        session2.latch === false &&
        voter2Updated.lockedUntil !== null,
      `readError: ${readError?.code}, session latch: ${session2.latch}`
    );

    // 6. Test abandoned session caught at login (voter timed out without ever calling FSM)
    console.log('Testing abandoned session caught at login...');
    const roll3 = `R4_ABANDON_${Date.now()}`;
    const voter3 = await prisma.voter.create({
      data: {
        rollNumber: roll3,
        name: 'R4 Abandoned At Login Voter',
        passwordHash: hash,
        role: 'VOTER',
        hasVoted: false,
        voteSessionExpiresAt: new Date(Date.now() - 5 * 60000), // expired 5 mins ago
        lockedUntil: null,
      },
    });
    await prisma.votingSession.create({
      data: {
        voterId: voter3.id,
        electionId: election.id,
        q1: 0,
        q0: 1,
        latch: true,
        selSlot: 1,
      },
    });

    const loginAbandoned = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rollNumber: roll3, password: rawPass }),
    });

    const abandonedBody = await loginAbandoned.json();
    const session3 = await prisma.votingSession.findUniqueOrThrow({ where: { voterId: voter3.id } });
    const voter3Updated = await prisma.voter.findUniqueOrThrow({ where: { id: voter3.id } });

    record(
      'R4_LOGIN_ABANDONED_RESET',
      'Login detects expired session, resets VotingSession, and locks voter out',
      loginAbandoned.status === 403 &&
        abandonedBody.error.includes('You missed your voting window') &&
        session3.q0 === 0 &&
        session3.latch === false &&
        voter3Updated.lockedUntil !== null,
      `Status ${loginAbandoned.status}: ${abandonedBody.error}, session latch: ${session3.latch}`
    );

    // Clean up
    await prisma.votingSession.deleteMany({ where: { voterId: { in: [voter.id, voter2.id, voter3.id] } } });
    await prisma.voter.deleteMany({ where: { id: { in: [voter.id, voter2.id, voter3.id] } } });
  } finally {
    server.close();
  }
}

async function runR5SeedPasswordTests() {
  console.log('\n======================================================');
  console.log('⚡ REQUIREMENT R5: ENVIRONMENT-BASED ADMIN SECRETS');
  console.log('======================================================');

  // Test 1: Run seed script with custom ADMIN_PASSWORD env var
  const customPass = 'ChallengerSecretPassword!2026';

  try {
    console.log(`Running seed script with ADMIN_PASSWORD="${customPass}"...`);
    execSync(`npx tsx prisma/seed.ts`, {
      cwd: process.cwd(),
      env: { ...process.env, ADMIN_PASSWORD: customPass },
      stdio: 'pipe',
    });

    const adminCustom = await prisma.voter.findUnique({ where: { rollNumber: 'ADMIN001' } });
    const matchesCustom = adminCustom ? await bcrypt.compare(customPass, adminCustom.passwordHash) : false;
    const matchesDefault = adminCustom ? await bcrypt.compare('admin123', adminCustom.passwordHash) : false;

    record(
      'R5_CUSTOM_PASSWORD',
      'Seed script applies ADMIN_PASSWORD from environment to ADMIN001',
      matchesCustom && !matchesDefault,
      `matchesCustom=${matchesCustom}, matchesDefault=${matchesDefault}`
    );

    // Test 2: Run seed script WITHOUT ADMIN_PASSWORD (falling back to admin123)
    console.log('Running seed script WITHOUT ADMIN_PASSWORD (falling back to default "admin123")...');
    const cleanEnv = { ...process.env };
    delete cleanEnv.ADMIN_PASSWORD;

    execSync(`npx tsx prisma/seed.ts`, {
      cwd: process.cwd(),
      env: cleanEnv,
      stdio: 'pipe',
    });

    const adminDefault = await prisma.voter.findUnique({ where: { rollNumber: 'ADMIN001' } });
    const matchesDefaultNow = adminDefault ? await bcrypt.compare('admin123', adminDefault.passwordHash) : false;
    const matchesCustomNow = adminDefault ? await bcrypt.compare(customPass, adminDefault.passwordHash) : false;

    record(
      'R5_DEFAULT_FALLBACK',
      'Seed script falls back to "admin123" when ADMIN_PASSWORD is not provided and updates DB',
      matchesDefaultNow && !matchesCustomNow,
      `matchesDefault=${matchesDefaultNow}, matchesCustom=${matchesCustomNow}`
    );

    // Test 3: Verify login endpoint with the seeded credentials
    console.log('Verifying login API against newly seeded ADMIN001...');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRoutes);
    app.use(errorMiddleware);

    const server = http.createServer(app);
    let port = 0;
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });

    try {
      // Test with correct fallback password
      const resOk = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: 'ADMIN001', password: 'admin123' }),
      });
      const bodyOk = await resOk.json();
      const cookieHeader = resOk.headers.get('set-cookie');

      // Test with wrong password
      const resFail = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: 'ADMIN001', password: 'wrongpassword' }),
      });

      record(
        'R5_ADMIN_LOGIN_API',
        'Seeded admin can log in via /api/auth/login and rejects invalid passwords',
        resOk.status === 200 &&
          bodyOk.role === 'ADMIN' &&
          cookieHeader?.includes('token=') === true &&
          resFail.status === 401,
        `resOk=${resOk.status}, role=${bodyOk.role}, resFail=${resFail.status}`
      );
    } finally {
      server.close();
    }
  } catch (e: any) {
    record('R5_EXECUTION', 'Seed script execution', false, e.message, e);
  }
}

async function main() {
  try {
    await runR3ConcurrencyAndChainTests();
    await runR4TimeoutResetAndLockoutTests();
    await runR5SeedPasswordTests();

    console.log('\n======================================================');
    console.log('📊 CHALLENGER EMPIRICAL VERIFICATION SUMMARY');
    console.log('======================================================');
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    console.log(`Total empirical checks: ${totalCount} | Passed: ${passedCount} | Failed: ${totalCount - passedCount}\n`);

    if (passedCount === totalCount) {
      console.log('🎯 FINAL VERDICT: ALL EMPIRICAL CHALLENGES PASSED -> APPROVE');
    } else {
      console.log('⚠️ FINAL VERDICT: EMPIRICAL DEFECTS DETECTED -> REQUEST_CHANGES');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Unexpected crash in challenger runner:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
