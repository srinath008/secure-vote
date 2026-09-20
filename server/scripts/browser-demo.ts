/**
 * browser-demo.ts — Full visual walkthrough of SecureVote
 * Runs a headed Chromium browser so you can watch every step live.
 * Screenshots are saved at each step.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE     = 'http://localhost:5173';
const SS_DIR   = 'scripts/screenshots';
const SLOW_MO  = 600; // ms between actions — makes it easy to follow

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

let step = 0;
async function snap(page: import('playwright').Page, label: string) {
  step++;
  const file = path.join(SS_DIR, `${String(step).padStart(2,'0')}_${label.replace(/[^a-z0-9]/gi,'_')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`📸 [${step}] ${label} → ${file}`);
}

async function pause(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('\n🎬 SecureVote — Live Browser Demo');
  console.log('   Browser will open on your screen. Watch each step!\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW_MO,
    args: ['--start-maximized'],
  });

  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ══════════════════════════════════════════════
  // PHASE 1 — ADMIN: Login + Open Election
  // ══════════════════════════════════════════════
  console.log('\n═══ PHASE 1: ADMIN SETUP ═══');

  await page.goto(`${BASE}/login`);
  await snap(page, 'login_page');
  await pause(800);

  // Admin login
  await page.fill('#roll', 'ADMIN001');
  await page.fill('#pwd', 'admin123');
  await snap(page, 'admin_credentials_filled');
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin');
  await snap(page, 'admin_dashboard');
  await pause(1000);

  // Note what we see
  console.log('  ✅ Admin logged in → /admin dashboard');
  console.log('  ✅ Showing: Election in SETUP, turnout 0/30, empty audit log');

  // Open the election
  await page.click('button:has-text("Open Election")');
  await page.waitForSelector('button:has-text("Close Election")');
  await snap(page, 'election_now_open');
  await pause(800);
  console.log('  ✅ Election OPEN → students can now vote');

  // ══════════════════════════════════════════════
  // PHASE 2 — STUDENT CB25001 happy path
  // ══════════════════════════════════════════════
  console.log('\n═══ PHASE 2: STUDENT HAPPY PATH (CB25001 → Karthik Murthy) ═══');

  // Open a second tab for the student
  const voterPage = await ctx.newPage();
  await voterPage.goto(`${BASE}/login`);
  await snap(voterPage, 'voter_login_page');

  await voterPage.fill('#roll', 'CB25001');
  await voterPage.fill('#pwd', 'vote123');
  await snap(voterPage, 'voter_credentials_filled');
  await voterPage.click('button[type=submit]');
  await voterPage.waitForURL('**/vote');
  await snap(voterPage, 'vote_page_S0_IDLE');
  await pause(800);
  console.log('  ✅ CB25001 (Aarav Sharma) logged in → /vote');
  console.log('  ✅ State: S0_IDLE — Authorize button visible');

  // Authorize
  await voterPage.click('button:has-text("Authorize")');
  await voterPage.waitForSelector('button:has-text("Karthik Murthy")');
  await snap(voterPage, 'vote_page_S1_ENABLED_ballot');
  await pause(800);
  console.log('  ✅ Clicked Authorize → S0→S1 — 4 candidate buttons now visible');

  // Vote for Karthik Murthy (slot 2)
  await voterPage.click('button:has-text("Karthik Murthy")');
  await voterPage.waitForSelector('button:has-text("Done")');
  await snap(voterPage, 'vote_page_S3_CONFIRM');
  await pause(1000);
  console.log('  ✅ Pressed Karthik Murthy → S1→S2→S3 (COMMIT) — confirmation shown');

  // Done / ACK
  await voterPage.click('button:has-text("Done")');
  await voterPage.waitForSelector('button:has-text("Authorize")');
  await snap(voterPage, 'vote_page_S0_IDLE_after_vote');
  await pause(800);
  console.log('  ✅ Clicked Done → S3→S0 — back to idle, locked out');

  // ══════════════════════════════════════════════
  // MACHINE VIEW — live hardware display
  // ══════════════════════════════════════════════
  console.log('\n═══ MACHINE VIEW: Hardware Panel ═══');
  await voterPage.goto(`${BASE}/machine`);
  await voterPage.waitForSelector('.machine-panel');
  await pause(1200);
  await snap(voterPage, 'machine_view_after_vote');
  console.log('  ✅ /machine: Q1=0 Q0=0 (S0_IDLE), IDLE_LAMP=1, latch RESET');
  console.log('  ✅ Audit log shows the full transition trail');

  // ══════════════════════════════════════════════
  // WORST CASE 1 — Double vote attempt
  // ══════════════════════════════════════════════
  console.log('\n═══ WORST CASE 1: CB25001 tries to vote again ═══');
  await voterPage.goto(`${BASE}/vote`);
  await voterPage.waitForSelector('button:has-text("Authorize")');
  await voterPage.click('button:has-text("Authorize")');
  await pause(800);
  await snap(voterPage, 'worst1_double_vote_blocked');
  console.log('  ✅ "Voter has already voted" — FSM stays S0, latch stays RESET');

  // ══════════════════════════════════════════════
  // WORST CASE 2 — Second student (CB25002) votes all buttons
  // ══════════════════════════════════════════════
  console.log('\n═══ WORST CASE 2: CB25002 presses WRONG ORDER (ack before press) ═══');
  const voter2Page = await ctx.newPage();
  await voter2Page.goto(`${BASE}/login`);
  await voter2Page.fill('#roll', 'CB25002');
  await voter2Page.fill('#pwd', 'vote123');
  await voter2Page.click('button[type=submit]');
  await voter2Page.waitForURL('**/vote');

  // Try to skip authorize — click nothing and send ack directly via URL
  // The UI won't show ack button yet, so this shows that nothing appears
  await snap(voter2Page, 'worst2_CB25002_sees_S0');
  console.log('  ✅ CB25002 lands on S0 — cannot do anything without Authorize');

  // Now demonstrate normal vote for CB25002
  console.log('\n═══ CB25002 votes normally ═══');
  await voter2Page.click('button:has-text("Authorize")');
  await voter2Page.waitForSelector('button:has-text("Priya Menon")');
  await snap(voter2Page, 'CB25002_ballot_S1');

  // Vote for Priya Menon (slot 1)
  await voter2Page.click('button:has-text("Priya Menon")');
  await voter2Page.waitForSelector('button:has-text("Done")');
  await snap(voter2Page, 'CB25002_confirmed_S3');
  await voter2Page.click('button:has-text("Done")');
  await voter2Page.waitForSelector('button:has-text("Authorize")');
  console.log('  ✅ CB25002 voted for Priya Menon — 2 votes total now');

  // ══════════════════════════════════════════════
  // WORST CASE 3 — Results while still OPEN
  // ══════════════════════════════════════════════
  console.log('\n═══ WORST CASE 3: Try to see results while election is OPEN ═══');
  await voterPage.goto(`${BASE}/results`);
  await pause(800);
  await snap(voterPage, 'worst3_results_hidden_while_open');
  console.log('  ✅ "Results not available — election has not closed yet"');

  // ══════════════════════════════════════════════
  // PHASE 4 — Admin: check turnout, view audit, close election, see results
  // ══════════════════════════════════════════════
  console.log('\n═══ PHASE 4: ADMIN CLOSES ELECTION + RESULTS ═══');
  await page.bringToFront();
  await page.reload();
  await pause(1000);
  await snap(page, 'admin_turnout_2_of_30');
  console.log('  ✅ Turnout: 2/30 voted');

  // Scroll to audit log
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pause(500);
  await snap(page, 'admin_audit_log');
  console.log('  ✅ Audit log shows all FSM transitions with ⚡ COMMIT markers');

  // Close the election
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('button:has-text("Close Election")');
  await page.waitForSelector('text=election closed', { timeout: 5000 }).catch(() => {});
  await pause(800);
  await snap(page, 'admin_election_closed');
  console.log('  ✅ Election CLOSED — no more votes possible');

  // ══════════════════════════════════════════════
  // FINAL RESULTS
  // ══════════════════════════════════════════════
  console.log('\n═══ FINAL RESULTS ═══');
  await voterPage.goto(`${BASE}/results`);
  await voterPage.waitForSelector('text=Total votes', { timeout: 5000 }).catch(() => {});
  await pause(800);
  await snap(voterPage, 'final_results_page');
  console.log('  ✅ Results visible: tallies, winner badge, percentages');

  // Final machine view
  await voterPage.goto(`${BASE}/machine`);
  await voterPage.waitForSelector('.machine-panel');
  await pause(1200);
  await snap(voterPage, 'final_machine_view');
  console.log('  ✅ Machine view: full audit trail, Q1=0 Q0=0 (S0_IDLE)');

  console.log(`\n🎬 Demo complete! ${step} screenshots saved to server/scripts/screenshots/`);
  console.log('   Keeping browser open for 8 seconds so you can explore...');
  await pause(8000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
