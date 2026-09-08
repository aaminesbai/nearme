import { BORDEAUX } from '@nearme/shared';
import { data } from './service';
import { pool } from './db';
import { config } from './config';
if (!config.demo) throw new Error('Set DEMO_MODE=true outside production to seed');
try {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE username='demo_anchor'",
  );
  let id = existing.rows[0]?.id;
  if (!id) {
    const result = await data.register({
      username: 'demo_anchor',
      displayName: 'Bordeaux',
      avatar: 6,
      bio: 'Local seed anchor',
    });
    id = result.user.id;
    await data.accept(id);
    await data.updateProfile(id, { visible: false });
  }
  await data.location(id, BORDEAUX);
  await data.seed(id, BORDEAUX);
  console.log(
    'Seeded 5 isolated Bordeaux profiles. Each app account creates its own demo circle via /demo/seed.',
  );
} finally {
  await pool.end();
}
