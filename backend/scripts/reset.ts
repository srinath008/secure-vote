import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reset() {
  console.log('🔄 Resetting vote data...');

  await prisma.ballot.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.votingSession.deleteMany({});
  await prisma.candidate.updateMany({ data: { tally: 0 } });
  await prisma.voter.updateMany({ where: { role: 'VOTER' }, data: { hasVoted: false } });
  await prisma.election.updateMany({ data: { status: 'SETUP', openedAt: null, closedAt: null } });

  const voters   = await prisma.voter.count({ where: { hasVoted: false, role: 'VOTER' } });
  const election = await prisma.election.findFirst({ include: { candidates: { orderBy: { slot: 'asc' } } } });

  console.log(`✅ Reset complete — ${voters} voters ready`);
  console.log(`   Election: "${election!.title}" → ${election!.status}`);
  election!.candidates.forEach(c => console.log(`   Slot ${c.slot}: ${c.name} | tally=${c.tally}`));
}

reset().catch(console.error).finally(() => prisma.$disconnect());
