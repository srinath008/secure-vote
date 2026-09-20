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
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SecureVote database with real class list...');

  // 1. Admin
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
  console.log(`  ✔ Admin:  ADMIN001 / admin123`);

  // 2. Class Voters
  const classDataPath = path.join(__dirname, '../scripts/class_data.json');
  const classData = JSON.parse(fs.readFileSync(classDataPath, 'utf8'));

  let csvContent = 'Roll Number,Name,PIN (Password)\n';

  console.log(`  ✔ Found ${classData.length} students in class list.`);

  for (const student of classData) {
    // Generate a random 4-digit PIN for each student
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const hash = await bcrypt.hash(pin, 12);
    
    await prisma.voter.upsert({
      where:  { rollNumber: student.roll },
      update: {}, // Don't overwrite if they already exist
      create: {
        rollNumber:   student.roll,
        name:         student.name,
        passwordHash: hash,
        role:         'VOTER',
      },
    });

    csvContent += `${student.roll},"${student.name}",${pin}\n`;
  }
  
  const csvPath = path.join(__dirname, '../scripts/student_credentials.csv');
  fs.writeFileSync(csvPath, csvContent);
  console.log(`  ✔ Credentials exported to: server/scripts/student_credentials.csv (DO NOT COMMIT THIS FILE)`);

  // 3. Election
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
    console.log(`  ✔ Election: "${election.title}" (SETUP)`);
  }

  console.log('\n✅ Seed complete.');
  console.log('\n🎯 Next steps:');
  console.log('  1. Log in as ADMIN001 to open the election.');
  console.log('  2. Distribute the 4-digit PINs from `server/scripts/student_credentials.csv` to your classmates.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
