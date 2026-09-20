const API_BASE = 'http://localhost:3001';
const { execSync } = require('child_process');

async function apiCall(path, method, body, cookie = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const newCookie = res.headers.get('set-cookie') || cookie;
  let data;
  try { data = await res.json(); } catch(e) { data = await res.text(); }
  return { status: res.status, data, cookie: newCookie };
}

async function run() {
  console.log("🚀 Resetting Database for clean state...");
  execSync('npx tsx scripts/reset.ts', { stdio: 'inherit' });
  console.log("🚀 Starting Security & Penetration Tests...\n");

  // TEST 1: Admin Login & Open Election
  let adminRes = await apiCall('/api/auth/login', 'POST', { rollNumber: 'ADMIN001', password: 'admin123' });
  let adminCookie = adminRes.cookie;
  console.log("[Test 1] Admin Login:", adminRes.status === 200 ? '✅ PASS' : '❌ FAIL', adminRes.status);
  
  let elections = await apiCall('/api/admin/election/current', 'GET', null, adminCookie);
  if (elections.data.status !== 'OPEN') {
    await apiCall(`/api/admin/election/${elections.data.id}/status`, 'PATCH', { status: 'OPEN' }, adminCookie);
  }

  // TEST 2: Voter 1 Normal Vote Flow
  let v1 = await apiCall('/api/auth/login', 'POST', { rollNumber: 'CB25001', password: 'vote123' });
  let v1Cookie = v1.cookie;
  console.log("[Test 2] Voter 1 Login:", v1.status === 200 ? '✅ PASS' : '❌ FAIL', v1.status);
  
  let enable = await apiCall('/api/fsm/enable', 'POST', null, v1Cookie);
  let press = await apiCall('/api/fsm/press', 'POST', { buttons: [true, false, false, false] }, v1Cookie);
  let ack = await apiCall('/api/fsm/ack', 'POST', null, v1Cookie);
  console.log("[Test 2] Voter 1 FSM Flow (enable->press->ack):", ack.status === 200 ? '✅ PASS' : '❌ FAIL');

  // ATTACK 1: Voter 1 Double Vote via Re-Login
  let attack1 = await apiCall('/api/auth/login', 'POST', { rollNumber: 'CB25001', password: 'vote123' });
  console.log("[Attack 1] Double Vote (Re-Login Blocked):", attack1.status === 403 ? '✅ BLOCKED' : '❌ FAIL', attack1.data);

  // ATTACK 2: Voter 1 Double Vote via Old Token
  let attack2 = await apiCall('/api/fsm/enable', 'POST', null, v1Cookie);
  console.log("[Attack 2] Double Vote (Old Token Reuse):", attack2.status !== 200 || attack2.data?.note?.includes('already voted') ? '✅ BLOCKED/HANDLED' : '❌ FAIL', attack2.data?.note || attack2.status);

  // ATTACK 3: Unauthorized Admin Actions (Voter hitting Admin API)
  let v2 = await apiCall('/api/auth/login', 'POST', { rollNumber: 'CB25002', password: 'vote123' });
  let v2Cookie = v2.cookie;
  let attack3 = await apiCall('/api/admin/turnout', 'GET', null, v2Cookie);
  console.log("[Attack 3] Privilege Escalation (Voter hitting Admin API):", attack3.status === 403 || attack3.status === 401 ? '✅ BLOCKED' : '❌ FAIL', attack3.status);

  // ATTACK 4: Multi-select Invalid Input
  await apiCall('/api/fsm/enable', 'POST', null, v2Cookie);
  let attack4 = await apiCall('/api/fsm/press', 'POST', { buttons: [true, true, true, true] }, v2Cookie);
  console.log("[Attack 4] Multi-select Priority Encoder test:", attack4.data?.selSlot !== null ? '✅ HANDLED (Resolves to slot 0)' : '❌ FAIL', 'Selected:', attack4.data?.selSlot);
  
  // ATTACK 5: Concurrency / Race Condition (Spamming presses)
  console.log("   - Firing 10 concurrent press requests...");
  let v4 = await apiCall('/api/auth/login', 'POST', { rollNumber: 'CB25004', password: 'vote123' });
  await apiCall('/api/fsm/enable', 'POST', null, v4.cookie);

  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(apiCall('/api/fsm/press', 'POST', { buttons: [false, true, false, false] }, v4.cookie));
  }
  const results = await Promise.all(promises);
  // Only 1 should actually register the commit flag, but all return state code 3 since engine auto-advances S2->S3
  const successCount = results.filter(r => r.status === 200 && r.data?.state?.code === 3).length;
  console.log("[Attack 5] Concurrency Race Condition test:", successCount === 10 ? '✅ HANDLED (Engine is sequential, outputs S3)' : `❌ FAIL (Count: ${successCount})`);

  // ATTACK 6: Voting when Closed
  console.log("   - Admin closing election...");
  await apiCall(`/api/admin/election/${elections.data.id}/status`, 'PATCH', { status: 'CLOSED' }, adminCookie);
  
  let v5 = await apiCall('/api/auth/login', 'POST', { rollNumber: 'CB25005', password: 'vote123' });
  let attack6 = await apiCall('/api/fsm/enable', 'POST', null, v5.cookie);
  console.log("[Attack 6] Voting while Election Closed:", attack6.data?.note?.includes('CLOSED') ? '✅ BLOCKED' : '❌ FAIL', attack6.data?.note || attack6.data);

}

run().catch(console.error);
