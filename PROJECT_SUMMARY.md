# நம்ம Vote (Namma Vote) — Project Summary & Context Memory

*Last Updated: September 28, 2026*

## 1. Project Overview
**நம்ம Vote** (formerly SecureVote) is an Electronic Voting Machine (EVM) simulation built for the Amrita University Class Representative Elections (AY 2025–26). The defining feature of this project is its **Finite State Machine (FSM) Engine**, which strictly enforces voting rules using Boolean logic (simulating hardware states) rather than standard CRUD operations.

## 2. Architecture & Tech Stack
*   **Frontend:** React, TypeScript, Tailwind CSS, Vite. Deployed as a Single Page Application (SPA).
*   **Backend:** Node.js, Express, TypeScript, Zod. Deployed as Serverless Functions.
*   **Database:** Neon Postgres (Cloud). Uses Prisma ORM.
*   **Hosting:** Both Frontend and Backend are deployed on **Vercel**.
*   **Authentication:** Custom JWT-based authentication using `localStorage` and `Authorization: Bearer` headers.

## 3. Key Features Implemented

### Finite State Machine (FSM) Engine
*   Simulates physical EVM states (`S0_IDLE`, `S1_ENABLED`, `S2_LOCKED`, `S3_CONFIRM`).
*   Transitions are executed inside strict database transactions using `prisma.$transaction`.
*   Complete anonymity: The `Ballot` table stores the vote, but never a reference to the `Voter`. 
*   An `AuditLog` table securely tracks every state transition and input vector for verification.

### Authentication System
*   **Voters:** Log in using their Roll Number (e.g., `CB.AI.U4AIM25040`). By default, they receive a secure OTP via email (using Gmail SMTP). 
*   **QA/Legacy Fallback:** Test students with a pre-existing `passwordHash` can enter their password directly into the OTP field to bypass email verification.
*   **Admins:** Log in using `ADMIN001` and a static password (`admin123`).

### Election Management (Admin Panel)
*   Admins can create new elections, specifying the Election Title.
*   Candidates are assigned strictly to physical slots (0 to 3).
*   Admins can add a **Tagline** and **Campaign Promises** (bullet points) for each candidate.
*   Admins control the election state (`SETUP` → `OPEN` → `CLOSED`) and view real-time turnout metrics and audit logs.

### Voter Experience
*   If no election is open, voters see a clean "No Election Currently" state.
*   When open, voters can read candidate promises on the `/election` page before entering the voting booth.
*   After casting a vote, the system processes the ballot and enforces an **immediate auto-logout**.
*   **Double-Vote Prevention:** If a user tries to log in again after voting, they are blocked at the login screen.

## 4. Major Challenges & Fixes Resolved

1.  **Vercel Cross-Domain Cookie Blocking (SameSite Policy)**
    *   *Issue:* The frontend (`namma-vote.vercel.app`) couldn't send the `httpOnly` JWT cookie to the backend (`namma-vote-backend.vercel.app`) due to modern browser cross-site restrictions.
    *   *Fix:* Rewrote the authentication flow to return the JWT in the JSON body, store it in `localStorage`, and send it via the `Authorization: Bearer` header on all API calls.
2.  **Severe 30+ Second Voting Latency**
    *   *Issue:* Vercel defaulted to deploying the backend in Washington D.C. (`iad1`), while the Neon Database is in Singapore (`ap-southeast-1`). The FSM voting transaction executes 6 sequential queries, resulting in massive cross-globe network delays and connection pool exhaustion.
    *   *Fix:* Added a `vercel.json` to the backend to force deployment to `sin1` (Singapore), cutting latency from ~250ms to ~2ms per query. Additionally reduced frontend polling frequency from 3000ms to 10000ms.
3.  **Vercel 404 on Refresh (SPA Routing)**
    *   *Issue:* Refreshing the page on `/admin` or `/election` resulted in a Vercel 404 "Page doesn't exist" error.
    *   *Fix:* Added a `vercel.json` to the frontend instructing Vercel to rewrite all routes `/(.*)` back to `index.html`.
4.  **Admin Forbidden from Viewing Election Page**
    *   *Issue:* The `/election` page fetched data via `fsmApi.getState()`, which had a strict `requireVoter` middleware, causing Admins to see "Election Not Yet Open" due to a silent 403 error.
    *   *Fix:* Updated the frontend `ElectionPage.tsx` to detect Admin users and seamlessly fetch election data from `adminApi.getCurrentElection()` instead.
5.  **Rebranding**
    *   Successfully purged all references to "SecureVote" and replaced them with "நம்ம Vote" across the UI, emails, document titles, and READMEs.

## 6. Current Deployment URLs
*   **Frontend (Live App):** [https://namma-vote.vercel.app](https://namma-vote.vercel.app)
*   **Backend (API):** [https://namma-vote-backend.vercel.app](https://namma-vote-backend.vercel.app)
*   **GitHub Repository:** [srinath008/secure-vote-](https://github.com/srinath008/secure-vote-)

## 7. Automated QA Status
A Headless Browser Automation Agent was successfully run against the production Vercel deployment. 
*   **Passed:** Admin login and election creation with promises.
*   **Passed:** FSM hardware simulation and state updates.
*   **Passed:** Ballot creation and auto-logout.
*   **Passed:** Strict rejection of secondary login attempts post-voting.
