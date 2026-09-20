# SecureVote — FSM-Based Electronic Voting System

A full-stack reimplementation of a Nand2Tetris HDL electronic voting machine as a deployed web application. The defining requirement: **vote integrity is enforced by a real Finite State Machine**, not scattered conditional logic. Every vote-related mutation passes through a single state-machine step function, built from Boolean gate primitives that mirror the original 74LS-series IC design.

---

## State Diagram

```
                    EN=1
        ┌─────────────────────────────►┐
        │                               │
  ┌─────┴──────┐               ┌────────┴───────┐
  │  S0_IDLE   │◄──────────────│  S1_ENABLED    │
  │   Q1Q0=00  │  EN=0 (loop)  │   Q1Q0=01      │
  └─────┬──────┘               └────────┬───────┘
        │  EN=0 (self)                  │ V=1
        │                               ▼
        │                     ┌─────────────────┐
        │                     │  S2_LOCKED      │  ← COMMIT here
        │◄────────────────────│   Q1Q0=10       │    (tally++, ballot, hasVoted)
        │     ACK=1           └────────┬────────┘
  ┌─────┴──────┐               1 (unconditional)
  │  S3_CONFIRM│◄──────────────────────┘
  │   Q1Q0=11  │
  └────────────┘
    ACK=0 (self)
```

---

## State Transition Table

| Current State | Condition | Next State |
|---|---|---|
| `S0_IDLE` (00) | `EN = 1` | `S1_ENABLED` (01) |
| `S0_IDLE` (00) | `EN = 0` | `S0_IDLE` (00) |
| `S1_ENABLED` (01) | `V = 1` | `S2_LOCKED` (10) |
| `S1_ENABLED` (01) | `V = 0` | `S1_ENABLED` (01) |
| `S2_LOCKED` (10) | unconditional | `S3_CONFIRM` (11) |
| `S3_CONFIRM` (11) | `ACK = 1` | `S0_IDLE` (00) |
| `S3_CONFIRM` (11) | `ACK = 0` | `S3_CONFIRM` (11) |

---

## Boolean Equations (Next-State Logic)

```
Q1_next = (¬Q1·Q0·V) + (Q1·¬Q0) + (Q1·Q0·¬ACK)
Q0_next = (¬Q1·¬Q0·EN) + (¬Q1·Q0·¬V) + (Q1·¬Q0) + (Q1·Q0·¬ACK)
```

Implemented in [`server/src/fsm/nextState.ts`](server/src/fsm/nextState.ts) using gate primitives.  
Moore outputs: `IDLE_LAMP = ¬Q1·¬Q0`, `BALLOT_ACTIVE = ¬Q1·Q0`, `COMMIT = Q1·¬Q0`, `CONFIRM_LAMP = Q1·Q0`.

---

## HDL → Software Mapping

| HDL Module | Software Counterpart |
|---|---|
| `SRLatch` | `SRLatch` class in `srLatch.ts` |
| `StateReg` (2-bit) | `q1`, `q0` columns on `VotingSession` |
| `NextState` (combinational) | `nextState()` pure function in `nextState.ts` |
| `EVMFSM` / `EVMTop` | `fsmStep()` in `engine.ts` |
| `PriorityEncoder` (74LS148) | `priorityEncode()` in `priorityEncoder.ts` |
| `Decoder2to4` | `decode2to4()` in `decoder.ts` |
| `Counter2` / tally registers | `Candidate.tally`, incremented only in `S2_LOCKED` |

---

## Documented Limitation

**Maximum 4 candidates.** The priority encoder is 4-input (matching the 74LS148 equivalent) and the decoder is 2-to-4. Adding more candidates requires increasing the encoder/decoder width — a hardware-width architectural change, not a code change.

---

## Setup Instructions

### Prerequisites
- Node.js 20+
- A PostgreSQL database (free tier on [Neon](https://neon.tech) or [Supabase](https://supabase.com))

### 1. Clone and install dependencies

```bash
git clone <repo>
cd project

# Install root (concurrently)
npm install

# Install server
cd server && npm install && cd ..

# Install client
cd client && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example server/.env
# Edit server/.env:
#   DATABASE_URL=<your postgres connection string>
#   JWT_SECRET=<64 random hex chars>
#   CLIENT_ORIGIN=http://localhost:5173
#   ALLOW_SELF_REGISTER=true
```

### 3. Set up the database

```bash
cd server
npx prisma db push      # create tables
npm run seed            # seed admin + 30 voters + election
```

### 4. Run in development

```bash
# From project root:
npm run dev
# → Backend: http://localhost:3001
# → Frontend: http://localhost:5173
```

### 5. Run tests

```bash
npm test   # runs all 124+ tests (from project root)
```

---

## Seed Credentials (Demo)

| Role | Roll Number | Password |
|---|---|---|
| Admin | `ADMIN001` | `admin123` |
| Voter | `CB25001` | `vote123` |
| Voter | `CB25002` | `vote123` |
| … | `CB25001`–`CB25030` | `vote123` |

---

## Demo Script

1. Log in as `CB25001 / vote123`
2. Open `/machine` in a second browser window
3. On `/vote`, click **Authorize** → watch Q1Q0 go `00 → 01` in the machine view
4. Select a candidate → watch `01 → 10 → 11` with the **COMMIT** lamp firing in state `10`
5. Click **Done** → watch `11 → 00` with the latch cleared
6. Try to vote again → machine refuses to leave S0 (hasVoted = true, latch stays reset)
7. Log in as `ADMIN001 / admin123`, navigate to `/admin`, close the election
8. Navigate to `/results` → final tallies appear

---

## Deployment

- **Backend:** Render or Railway — set env vars, `npm run build && npm start`
- **Frontend:** Vercel or Netlify — set `VITE_API_URL` to the backend URL
- **Database:** Neon or Supabase PostgreSQL
- Commit `.env.example`; never commit real secrets

---

## Project Structure

```
project/
├── client/                 React 18 + Vite + TypeScript + Tailwind
│   └── src/
│       ├── api/fsm.ts      Typed API client
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── VotePage.tsx      ← State-driven, no local step state
│       │   ├── ResultsPage.tsx
│       │   ├── AdminPage.tsx
│       │   └── MachinePage.tsx   ← Hardware instrument panel view
│       └── App.tsx
└── server/
    ├── src/
    │   ├── fsm/            Pure functions — NO database, NO Express
    │   │   ├── gates.ts         Bit type, not/and/or/nand/xor
    │   │   ├── states.ts        State constants and encode/decode
    │   │   ├── nextState.ts     Boolean equations (authoritative)
    │   │   ├── outputs.ts       Moore output decode
    │   │   ├── priorityEncoder.ts  74LS148 equivalent
    │   │   ├── decoder.ts       2-to-4 one-hot decoder
    │   │   ├── srLatch.ts       NAND-gate SR latch
    │   │   └── engine.ts        ← ONLY file that touches DB + tally
    │   ├── routes/
    │   ├── middleware/
    │   └── index.ts
    ├── tests/              Vitest — 124+ assertions
    └── prisma/schema.prisma
```
