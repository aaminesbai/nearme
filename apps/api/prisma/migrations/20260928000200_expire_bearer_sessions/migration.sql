ALTER TABLE "users" ADD COLUMN "token_expires_at" TIMESTAMPTZ(6);

-- Keep current installations signed in for a 30-day grace period after deployment.
UPDATE "users"
SET "token_expires_at" = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE "token_hash" IS NOT NULL;
