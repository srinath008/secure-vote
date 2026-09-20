# SecureVote — FSM-Based Electronic Voting System (Web Implementation)

## BUILD SPECIFICATION FOR AGENTIC IDE

**Read this entire document before writing any code. Everything you need is here. Do not ask clarifying questions — where this document does not specify a detail, choose the simplest option consistent with the rules below and proceed. Do not deviate from the FSM definition in Section 3 under any circumstances.**

---

## 1. PROJECT CONTEXT (why this is not a normal CRUD app)

This project originally existed as a hardware Electronic Voting Machine designed in Nand2Tetris HDL and built from 74LS-series logic ICs. Its defining claim is that **vote integrity — voter authorization, single-vote enforcement, vote locking, and tallying — is enforced by a finite state machine, not by scattered conditional logic.**

We are now reimplementing the exact same machine in software, as a deployed website where students log in and vote.

**The non-negotiable requirement: the FSM is not a metaphor here. It is the actual control core of the backend.** Every vote-related mutation in the system must pass through a single state-machine step function. There must be no code path anywhere in the application that writes a vote, sets a voted flag, or increments a tally except through that step function.

The original HDL modules and their software counterparts:

| HDL module | Software counterpart in this build |
|---|---|
| `SRLatch` | `VoterEnableLatch` — set on authorization, reset on commit |
| `StateReg` (2-bit) | `state` column on the voting session row (values 0–3) |
| `NextState` (combinational) | `nextState()` pure function implementing the Boolean equations |
| `EVMFSM` / `EVMTop` | `FSMEngine.step()` — the single transactional entry point |
| `PriorityEncoder` (74LS148 equivalent) | `priorityEncode()` pure function over a 4-bit button vector |
| `Decoder2to4` | `decode2to4()` pure function driving the selected-candidate output |
| `Counter2` / tally registers | `tally` rows, incremented only on the commit state |

---

## 2. TECHNOLOGY STACK (fixed — do not substitute)

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, React Router
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL, accessed via Prisma ORM
- **Auth:** JWT (access token in httpOnly cookie), passwords hashed with bcrypt
- **Testing:** Vitest for backend unit tests (these replace the original `.tst` scripts)
- **Package manager:** npm
- **Monorepo layout:** two folders, `client/` and `server/`, each with its own `package.json`, plus a root `package.json` with `concurrently` to run both in dev.

---

## 3. THE FINITE STATE MACHINE — AUTHORITATIVE DEFINITION

This section is the specification. Implement it exactly.

### 3.1 State encoding

The state register is 2 bits, `Q1 Q0`.

| Encoding | Name | Meaning |
|---|---|---|
| `00` (0) | `S0_IDLE` | No voter authorized. Ballot inactive. |
| `01` (1) | `S1_ENABLED` | Voter authorized and latched. Ballot active, awaiting candidate selection. |
| `10` (2) | `S2_LOCKED` | Selection captured and locked. Tally commit occurs on entry to this state. |
| `11` (3) | `S3_CONFIRM` | Vote recorded. Confirmation shown. Awaiting acknowledgement. |

### 3.2 Inputs

| Input | Source | Meaning |
|---|---|---|
| `EN` | Successful voter authentication for an open election | Enable / authorize signal (sets the SR latch) |
| `V` | Output of the priority encoder — 1 if any candidate button is asserted | Valid selection present |
| `SEL[1:0]` | Output of the priority encoder | Encoded candidate index |
| `ACK` | Voter presses "Done" on the confirmation screen | Acknowledge / clear |

### 3.3 State transition table

| Current state | Condition | Next state |
|---|---|---|
| `S0_IDLE` (00) | `EN = 1` | `S1_ENABLED` (01) |
| `S0_IDLE` (00) | `EN = 0` | `S0_IDLE` (00) |
| `S1_ENABLED` (01) | `V = 1` | `S2_LOCKED` (10) |
| `S1_ENABLED` (01) | `V = 0` | `S1_ENABLED` (01) |
| `S2_LOCKED` (10) | unconditional | `S3_CONFIRM` (11) |
| `S3_CONFIRM` (11) | `ACK = 1` | `S0_IDLE` (00) |
| `S3_CONFIRM` (11) | `ACK = 0` | `S3_CONFIRM` (11) |

### 3.4 Next-state Boolean equations

Implement `nextState()` using **exactly** these equations. Do not replace them with a switch statement. A switch statement may exist as a readability wrapper, but the canonical implementation and the unit tests must use the equations, because the whole point of this project is that the transition logic is derived from Boolean algebra.

```
Q1_next = (¬Q1 · Q0 · V) + (Q1 · ¬Q0) + (Q1 · Q0 · ¬ACK)

Q0_next = (¬Q1 · ¬Q0 · EN) + (¬Q1 · Q0 · ¬V) + (Q1 · ¬Q0) + (Q1 · Q0 · ¬ACK)
```

In TypeScript, implement with bitwise operations on `0 | 1` values:

```ts
export function nextState(q1: Bit, q0: Bit, EN: Bit, V: Bit, ACK: Bit): [Bit, Bit] {
  const nq1 = or(and(and(not(q1), q0), V), and(q1, not(q0)), and(and(q1, q0), not(ACK)));
  const nq0 = or(
    and(and(and(not(q1), not(q0)), EN), 1),
    and(and(not(q1), q0), not(V)),
    and(q1, not(q0)),
    and(and(q1, q0), not(ACK))
  );
  return [nq1, nq0];
}
```

Provide `not`, `and`, `or`, `nand` helpers in a `gates.ts` module and build everything from them, mirroring the HDL's gate-level construction.

### 3.5 Moore outputs (a function of state only)

| Output | Asserted in | Effect |
|---|---|---|
| `IDLE_LAMP` | `S0` | UI shows "Not authorized" |
| `BALLOT_ACTIVE` | `S1` | Candidate buttons enabled in UI |
| `COMMIT` | `S2` | **Tally increment + vote record write + latch reset happen here and nowhere else** |
| `CONFIRM_LAMP` | `S3` | UI shows confirmation screen with "Done" button |

Derive them as: `IDLE_LAMP = ¬Q1·¬Q0`, `BALLOT_ACTIVE = ¬Q1·Q0`, `COMMIT = Q1·¬Q0`, `CONFIRM_LAMP = Q1·Q0`.

### 3.6 Priority encoder (74LS148 equivalent)

Input: a 4-element boolean vector `B[0..3]` (candidate buttons).
Behaviour: if more than one button is asserted, the **highest index wins**. This is deliberate — it mirrors the hardware and guarantees a deterministic single selection even under a malformed or malicious multi-select request.

```
V     = B0 + B1 + B2 + B3        (valid flag: OR of all inputs)
SEL1  = B3 + B2
SEL0  = B3 + (B1 · ¬B2)
```

Implement `priorityEncode(b: [Bit,Bit,Bit,Bit]): { V: Bit; sel: 0|1|2|3 }` from the gate helpers. Unit-test all 16 input combinations.

### 3.7 Decoder 2→4

`decode2to4(sel)` returns a 4-element one-hot vector. Used to select which tally register receives the increment in `S2`, and to render which candidate is highlighted as locked.

```
D0 = ¬SEL1 · ¬SEL0
D1 = ¬SEL1 ·  SEL0
D2 =  SEL1 · ¬SEL0
D3 =  SEL1 ·  SEL0
```

### 3.8 SR latch (voter enable)

The latch is the hardware guarantee against double voting, and must be preserved as such.

- **SET** when a voter authenticates successfully AND `voter.hasVoted = false` AND the election is `OPEN`.
- **RESET** in `S2_LOCKED` (the commit state), atomically with the tally increment and the `hasVoted` flag write.
- While the latch is reset, `EN = 0` and the FSM cannot leave `S0`, so the voter physically cannot reach the ballot again.

Implement as `latch` (boolean) on the session row, updated only inside the FSM step transaction. Model it with NAND gates (`nand(nand(S, q), nand(R, ...))` style) in a `SRLatch` class so the derivation is visible in the code, but persist the resolved value.

### 3.9 Clocking model

Each API request that supplies FSM inputs corresponds to **exactly one clock tick**. On a tick:

1. Read current `(Q1, Q0, latch)` from the database **inside a serializable transaction with a row lock** (`SELECT ... FOR UPDATE`).
2. Compute `EN`, `V`, `SEL`, `ACK` from the request and the latch.
3. Compute `(Q1_next, Q0_next)`.
4. If the **new** state is `S2_LOCKED`, perform the commit side effects (Section 5.3).
5. Persist the new state, write an audit log row, commit the transaction.
6. Return the new state and its Moore outputs.

The `S2 → S3` transition is unconditional, so the server advances it immediately within the same request. The client therefore observes `S1 → S3` in one round trip, while the database records both ticks in the audit log. **Do not skip persisting the S2 tick** — it is the evidence that the commit happened in the commit state.

---

## 4. DATA MODEL (Prisma schema)

```prisma
model Voter {
  id           String   @id @default(uuid())
  rollNumber   String   @unique          // institutional ID, used as login
  name         String
  passwordHash String
  role         Role     @default(VOTER)
  hasVoted     Boolean  @default(false)
  createdAt    DateTime @default(now())
  session      VotingSession?
}

enum Role { VOTER ADMIN }

model Election {
  id         String         @id @default(uuid())
  title      String
  status     ElectionStatus @default(SETUP)
  openedAt   DateTime?
  closedAt   DateTime?
  candidates Candidate[]
  sessions   VotingSession[]
}

enum ElectionStatus { SETUP OPEN CLOSED }

model Candidate {
  id         String   @id @default(uuid())
  electionId String
  election   Election @relation(fields: [electionId], references: [id])
  name       String
  slot       Int      // 0..3 — the physical button index / encoder input line
  tally      Int      @default(0)   // the Counter2 equivalent
  @@unique([electionId, slot])
}

model VotingSession {
  id         String   @id @default(uuid())
  voterId    String   @unique
  voter      Voter    @relation(fields: [voterId], references: [id])
  electionId String
  election   Election @relation(fields: [electionId], references: [id])
  q1         Int      @default(0)   // state register bit 1
  q0         Int      @default(0)   // state register bit 0
  latch      Boolean  @default(false) // SR latch output
  selSlot    Int?                    // encoder output captured at lock time
  updatedAt  DateTime @updatedAt
}

model Ballot {
  id          String   @id @default(uuid())
  electionId  String
  candidateId String
  castAt      DateTime @default(now())
  // NO voterId. Ballots are anonymous by construction.
}

model AuditLog {
  id         String   @id @default(uuid())
  sessionId  String
  fromState  Int
  toState    Int
  inputsJson String   // { EN, V, SEL, ACK }
  commitFlag Boolean
  createdAt  DateTime @default(now())
}
```

**Anonymity rule:** `Ballot` must never store a voter reference. The link between a voter and their choice exists only for the duration of the commit transaction and is never persisted. `Voter.hasVoted` records *that* they voted; `Ballot` records *what* was voted. State this in a code comment on the model.

Candidate slots are limited to 0–3 because the encoder is 4-input, matching the hardware. Enforce this with validation. If more candidates are ever needed, that is a hardware-width change, not a code change — note this as a documented limitation in the README.

---

## 5. BACKEND

### 5.1 Directory structure

```
server/
  src/
    fsm/
      gates.ts            // not, and, or, nand, xor — primitive gate functions
      priorityEncoder.ts  // priorityEncode()
      decoder.ts          // decode2to4()
      srLatch.ts          // SRLatch class built from nand()
      nextState.ts        // nextState() Boolean equations
      outputs.ts          // Moore output decode
      states.ts           // state constants, names, encode/decode helpers
      engine.ts           // FSMEngine.step() — the ONLY transactional entry point
    routes/
      auth.routes.ts
      fsm.routes.ts
      election.routes.ts
      admin.routes.ts
    middleware/
      auth.middleware.ts  // JWT verify, role guard
      error.middleware.ts
    lib/
      prisma.ts
    index.ts
  tests/
    gates.test.ts
    priorityEncoder.test.ts   // all 16 input combinations
    decoder.test.ts           // all 4 inputs
    nextState.test.ts         // all 32 (state × input) combinations
    engine.test.ts            // full-path and violation tests
  prisma/schema.prisma
```

The `src/fsm/` folder must contain **no database code and no Express code**. It is pure functions and one class. `engine.ts` is the only file in it that touches Prisma. This mirrors the separation between combinational logic and the storage elements in the HDL design.

### 5.2 API endpoints

All FSM endpoints require a valid JWT. All of them return the same response shape so the client can render a single state-driven UI:

```ts
type FsmResponse = {
  state: { q1: 0|1; q0: 0|1; code: 0|1|2|3; name: string };
  outputs: { IDLE_LAMP: 0|1; BALLOT_ACTIVE: 0|1; COMMIT: 0|1; CONFIRM_LAMP: 0|1 };
  latch: boolean;
  selSlot: number | null;
  election: { id: string; title: string; status: string };
  candidates: { id: string; name: string; slot: number }[];  // tallies NEVER included while election is OPEN
}
```

| Method | Route | Role | Behaviour |
|---|---|---|---|
| `POST` | `/api/auth/register` | public | Register a voter with roll number + password. Disable in production via env flag; admin bulk import is the real path. |
| `POST` | `/api/auth/login` | public | Verify credentials, issue JWT cookie. Does **not** touch the FSM. |
| `POST` | `/api/auth/logout` | any | Clear cookie. |
| `GET` | `/api/fsm/state` | voter | Read-only. Returns current `FsmResponse`. No tick. |
| `POST` | `/api/fsm/enable` | voter | Tick with `EN = 1`. Server sets the latch **only if** election is OPEN and `hasVoted = false`; otherwise `EN = 0` and the state does not change. |
| `POST` | `/api/fsm/press` | voter | Body: `{ buttons: [boolean,boolean,boolean,boolean] }`. Tick with encoder-derived `V` and `SEL`. Drives `S1 → S2 → S3`. |
| `POST` | `/api/fsm/ack` | voter | Tick with `ACK = 1`. Drives `S3 → S0`. |
| `GET` | `/api/results` | any | Returns tallies **only if** election status is `CLOSED`; otherwise 403 with a clear message. |
| `POST` | `/api/admin/election` | admin | Create election with candidates (max 4, slots 0–3). |
| `PATCH` | `/api/admin/election/:id/status` | admin | `SETUP → OPEN → CLOSED`. Never backwards. Reject any other transition with 409. |
| `GET` | `/api/admin/audit` | admin | Paginated audit log. |
| `GET` | `/api/admin/turnout` | admin | Count of voters with `hasVoted = true` vs total. No per-voter choices. |

`/api/fsm/press` takes a raw button vector rather than a candidate ID **on purpose** — the priority encoder must do the resolution server-side, so that a client sending `[true,true,true,true]` still results in exactly one deterministic vote. Do not "simplify" this to a candidate ID parameter.

### 5.3 Commit semantics (the critical section)

Inside `FSMEngine.step()`, when and only when the computed next state is `S2_LOCKED`:

1. Re-verify `voter.hasVoted === false` and `election.status === 'OPEN'` **inside the same transaction**. If either fails, abort the tick, force the state to `S0`, clear the latch, and return an error.
2. `Candidate.tally` += 1 for the candidate whose slot matches the decoder's asserted line.
3. Insert a `Ballot` row (no voter reference).
4. Set `Voter.hasVoted = true`.
5. Reset the SR latch.
6. Write the audit row with `commitFlag = true`.
7. Immediately compute the unconditional `S2 → S3` tick, persist it and its audit row.

All of the above in **one** database transaction at `Serializable` isolation, with the session row locked. A duplicate or concurrent request must either block and then fail the `hasVoted` recheck, or fail the unique constraint — never double-count. Add a partial unique guard or an explicit recheck so that this is provably true, and write a concurrency test that fires 20 simultaneous `press` requests for the same voter and asserts the tally increased by exactly 1.

### 5.4 Rules the backend must enforce

- No endpoint may mutate `tally`, `Ballot`, or `hasVoted` outside `FSMEngine.step()`. Enforce by keeping those Prisma calls physically inside `engine.ts` and adding a comment banner saying so.
- Any request whose action is illegal for the current state (e.g. `press` while in `S0`) must **not** error out ambiguously — it is simply a tick that produces no state change, exactly as an unconnected input pin would in hardware. Return `200` with the unchanged state and a `note` field explaining the input was ignored. The only hard errors are auth failures, closed elections, and already-voted attempts.
- Rate-limit `/api/auth/login` (e.g. 10 attempts / 15 min / IP).
- Never return tallies while the election is `OPEN`, to any role including admin. Turnout only.

---

## 6. FRONTEND

### 6.1 Routes

| Route | Purpose |
|---|---|
| `/login` | Roll number + password |
| `/vote` | The voting machine UI — renders purely from the FSM state returned by the API |
| `/results` | Tallies, visible after the election is closed |
| `/admin` | Election setup, open/close controls, turnout, audit log |
| `/machine` | **Hardware view** — see 6.3 |

### 6.2 The voting screen is state-driven, not flow-driven

`/vote` must render from `state.code` alone. There must be no local React state that decides which step the user is on — the server's FSM is the single source of truth. On mount, call `GET /api/fsm/state` and render:

- `S0_IDLE` — a large "Authorize" / "Begin voting" button → `POST /api/fsm/enable`. If the voter has already voted, show "Your vote has been recorded" and disable the button.
- `S1_ENABLED` — the ballot: four candidate buttons (only those with candidates defined). Clicking candidate at slot *k* sends a button vector with index *k* true → `POST /api/fsm/press`.
- `S3_CONFIRM` — confirmation panel showing the locked candidate's name, plus a "Done" button → `POST /api/fsm/ack`.
- `S2_LOCKED` — transient; if ever observed, show a brief "Locking vote…" spinner.

Disable all buttons while a request is in flight, and treat the response as authoritative — never optimistically advance the UI.

### 6.3 The hardware view (`/machine`) — build this, it matters for the demo

A live panel that makes the digital logic visible, because this is the artefact that proves the project is an FSM implementation rather than a web form. It must show, updating on every tick:

- **State register:** two LED-style indicators for `Q1` and `Q0`, plus the state name and binary code.
- **State diagram:** the four states drawn as an SVG with the current state highlighted and the transition arrows labelled with their conditions (`EN`, `V`, `1`, `ACK`).
- **SR latch:** set/reset indicators and current `Q` output.
- **Priority encoder:** the four input lines, the `V` flag, and the encoded `SEL[1:0]` output.
- **Decoder:** the four one-hot output lines.
- **Moore outputs:** `IDLE_LAMP`, `BALLOT_ACTIVE`, `COMMIT`, `CONFIRM_LAMP` as lamps.
- **Transition log:** the last 20 audit entries as `from → to` with the input vector.

Style it deliberately like an instrument panel — dark background, monospace labels, green/amber indicator LEDs, thin connecting lines between blocks. It should be legible on a projector.

### 6.4 General UI

Clean, institutional, no emoji. Tailwind. A single accent colour. Readable on a projector: generous font sizes, high contrast. Fully keyboard accessible, ARIA live region announcing state changes.

---

## 7. TESTS (these replace the original `.tst` verification scripts)

Write these before wiring the routes. They are part of the deliverable, not optional.

1. `gates.test.ts` — truth tables for `not`, `and`, `or`, `nand`, `xor`.
2. `priorityEncoder.test.ts` — all 16 input vectors; assert highest-index priority and correct `V`.
3. `decoder.test.ts` — all 4 selections produce the correct one-hot output.
4. `nextState.test.ts` — exhaustive: for each of the 4 states × 8 input combinations of `(EN, V, ACK)`, assert the next state matches Section 3.3. 32 assertions minimum.
5. `srLatch.test.ts` — set, reset, hold, and set-dominant/reset-dominant behaviour as implemented.
6. `engine.test.ts`:
   - Happy path: `S0 → enable → S1 → press → S3 → ack → S0`, tally incremented once, `hasVoted` true, one `Ballot` row.
   - Double-vote: after the happy path, `enable` leaves the state at `S0` and no tally change.
   - Multi-press: `buttons = [true,true,true,true]` records exactly one vote for slot 3.
   - Out-of-order: `press` from `S0` and `ack` from `S1` produce no state change and no writes.
   - Closed election: `enable` is refused, no state change.
   - Concurrency: 20 parallel `press` requests for one voter → tally increases by exactly 1.
   - Anonymity: assert no `Ballot` row contains any voter-identifying column.

Target: all tests green before deployment. Include `npm test` in the root scripts.

---

## 8. SEED DATA

Seed script must create:
- 1 admin (`ADMIN001` / `admin123`)
- 30 voters (`CB25001`…`CB25030`, password `vote123`)
- 1 election titled "Class Representative Election 2026" in `SETUP` status
- 4 candidates in slots 0–3 with plausible names

Document these credentials in the README for the demo.

---

## 9. DEPLOYMENT

- Database: Neon or Supabase (free Postgres).
- Backend: Render or Railway web service, `npm run build && npm start`.
- Frontend: Vercel or Netlify, `VITE_API_URL` pointing at the backend.
- CORS restricted to the frontend origin, credentials enabled.
- `.env.example` committed with every required variable documented: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `PORT`, `ALLOW_SELF_REGISTER`.
- Never commit real secrets.

---

## 10. README (generate this as part of the build)

Must include: project summary, the state diagram (ASCII or embedded SVG), the state transition table, the Boolean equations from Section 3.4, the HDL-to-software mapping table from Section 1, setup instructions, seed credentials, the demo script below, and the documented 4-candidate limitation.

**Demo script to include:** log in as a voter → open `/machine` in a second window → authorize → observe `Q1Q0` go `00 → 01` → select a candidate → observe `01 → 10 → 11` with the commit lamp firing in `10` → acknowledge → observe `11 → 00` with the latch cleared → attempt to vote again and observe the machine refuse to leave `S0` → admin closes the election → results appear.

---

## 11. BUILD ORDER

Work in this sequence and do not skip ahead:

1. Scaffold the monorepo, `client/` and `server/`, TypeScript configs, Tailwind, Prisma.
2. Write `src/fsm/` in full — gates, encoder, decoder, latch, nextState, outputs. No database.
3. Write and pass tests 1–5. **Do not proceed until they are green.**
4. Prisma schema, migration, seed script.
5. `FSMEngine.step()` with the full transaction. Then tests 6. **Do not proceed until green.**
6. Auth routes and middleware.
7. FSM, election, and admin routes.
8. Frontend: login, `/vote`, `/results`, `/admin`.
9. Frontend: `/machine` hardware view.
10. README, `.env.example`, deployment config.

At the end, print a summary of: files created, test results, and the exact commands to run the project locally.

---

## 12. HARD CONSTRAINTS — RESTATED

1. The FSM defined in Section 3 is authoritative. Do not redesign states, add states, or change the transition table.
2. `nextState()` is implemented from the Boolean equations using gate primitives, not a switch statement.
3. `/api/fsm/press` accepts a 4-bit button vector, not a candidate ID. The priority encoder resolves it server-side.
4. Tally increments, ballot writes, and `hasVoted` writes occur **only** in the `S2_LOCKED` commit path inside `FSMEngine.step()`, inside one serializable transaction.
5. `Ballot` rows contain no voter reference. Ever.
6. Tallies are never exposed while the election is `OPEN`.
7. The client never decides the voting step; it renders whatever state the server reports.
8. Illegal inputs for the current state are ignored, not errors.
9. The `/machine` hardware view is a required deliverable, not a nice-to-have.
10. All listed tests must pass before deployment.
