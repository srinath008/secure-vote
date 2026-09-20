/**
 * seed.ts — Database seed for SecureVote demo
 *
 * Creates:
 *   1 admin:    ADMIN001 / admin123
 *   30 voters:  CB25001…CB25030 / vote123
 *   1 election: "Class Representative Election 2026" in SETUP status
 *   4 candidates in slots 0–3
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SecureVote database…');

  // ── Admin ─────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.voter.upsert({
    where:  { rollNumber: 'ADMIN001' },
    update: {},
    create: {
      rollNumber:   'ADMIN001',
      name:         'Admin',
      passwordHash: adminHash,
      role:         'ADMIN',
    },
  });
  console.log(`  ✓ Admin:  ADMIN001 / admin123  (id: ${admin.id})`);

  // ── 30 Voters ─────────────────────────────────────────────────────────────
  const voterHash = await bcrypt.hash('vote123', 12);
  const voterNames = [
    'Aarav Sharma',    'Ananya Krishnan',  'Arjun Mehta',     'Bhavna Iyer',
    'Chetan Rao',      'Deepika Nair',     'Elan Subramaniam','Fathima Siddiqui',
    'Gautam Verma',    'Harini Pillai',    'Ishan Bose',      'Jaya Patel',
    'Karthik Murthy',  'Lakshmi Reddy',    'Manav Joshi',     'Nithya Rajan',
    'Om Prakash',      'Priya Menon',      'Quamar Ansari',   'Ritu Agarwal',
    'Siddharth Kumar', 'Tanya Singh',      'Ujwal Hegde',     'Vandana Choudhary',
    'Waseem Ali',      'Xenia Thomas',     'Yash Gupta',      'Zara Khan',
    'Akash Deshpande', 'Bhavya Nambiar',
  ];

  for (let i = 1; i <= 30; i++) {
    const rollNumber = `CB25${String(i).padStart(3, '0')}`;
    await prisma.voter.upsert({
      where:  { rollNumber },
      update: {},
      create: {
        rollNumber,
        name:         voterNames[i - 1],
        passwordHash: voterHash,
        role:         'VOTER',
      },
    });
  }
  console.log('  ✓ 30 voters: CB25001…CB25030 / vote123');

  // ── Election ──────────────────────────────────────────────────────────────
  const existing = await prisma.election.findFirst({
    where: { title: 'Class Representative Election 2026' },
  });

  if (!existing) {
    const election = await prisma.election.create({
      data: {
        title:  'Class Representative Election 2026',
        status: 'SETUP',
        candidates: {
          create: [
            { name: 'Arjun Mehta',    slot: 0 },
            { name: 'Priya Menon',    slot: 1 },
            { name: 'Karthik Murthy', slot: 2 },
            { name: 'Ananya Krishnan',slot: 3 },
          ],
        },
      },
      include: { candidates: true },
    });
    console.log(`  ✓ Election: "${election.title}" (SETUP)`);
    for (const c of election.candidates) {
      console.log(`    Slot ${c.slot}: ${c.name}`);
    }
  } else {
    console.log(`  ℹ Election already exists (id: ${existing.id}), skipping.`);
  }

  console.log('\n✅ Seed complete.');
  console.log('\n── Demo Credentials ────────────────────────────────');
  console.log('  Admin:  ADMIN001  / admin123');
  console.log('  Voter:  CB25001   / vote123  (…through CB25030)');
  console.log('────────────────────────────────────────────────────\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
