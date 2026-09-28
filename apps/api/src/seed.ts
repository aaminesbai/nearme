import { BORDEAUX } from '@nearme/shared';
import { data } from './service';
import { prisma } from './db';
import { config } from './config';
if (!config.demo) throw new Error('Set DEMO_MODE=true outside production to seed');
try {
  const anchor = await prisma.user.upsert({
    where: { username: 'demo_anchor' },
    create: {
      username: 'demo_anchor',
      displayName: 'Bordeaux',
      avatar: 6,
      bio: 'Local seed anchor',
      isDemo: true,
      charterAcceptedAt: new Date(),
      visible: false,
    },
    update: { isDemo: true, tokenHash: null, passwordHash: null, visible: false },
    select: { id: true },
  });
  const id = anchor.id;
  await data.location(id, BORDEAUX);
  await data.seed(id, BORDEAUX);
  console.log(
    'Seeded 5 isolated Bordeaux profiles. Each app account creates its own demo circle via /demo/seed.',
  );
} finally {
  await prisma.$disconnect();
}
