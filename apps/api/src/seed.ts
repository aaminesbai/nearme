import { BORDEAUX } from '@nearme/shared';
import { data } from './service';
import { pool } from './db';
import { config } from './config';
if (!config.demo) throw new Error('Set DEMO_MODE=true outside production to seed');
try {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users(username,display_name,avatar,bio,is_demo,charter_accepted_at,visible)
     VALUES('demo_anchor','Bordeaux',6,'Local seed anchor',true,now(),false)
     ON CONFLICT(username) DO UPDATE SET is_demo=true,token_hash=NULL,password_hash=NULL,visible=false
     RETURNING id`,
  );
  const id = result.rows[0].id;
  await data.location(id, BORDEAUX);
  await data.seed(id, BORDEAUX);
  console.log(
    'Seeded 5 isolated Bordeaux profiles. Each app account creates its own demo circle via /demo/seed.',
  );
} finally {
  await pool.end();
}
