CREATE TABLE "push_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    CONSTRAINT "push_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_outbox_status_check" CHECK ("status" IN ('pending', 'sent', 'suppressed', 'failed')),
    CONSTRAINT "push_outbox_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "push_outbox_message_id_key" ON "push_outbox"("message_id");
CREATE INDEX "push_outbox_pending_idx" ON "push_outbox"("status", "available_at");

ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "push_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outbox_id" UUID NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_check_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "push_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_receipts_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "push_receipts_ticket_id_key" ON "push_receipts"("ticket_id");
CREATE INDEX "push_receipts_due_idx" ON "push_receipts"("completed_at", "next_check_at");

ALTER TABLE "push_receipts" ADD CONSTRAINT "push_receipts_outbox_id_fkey"
  FOREIGN KEY ("outbox_id") REFERENCES "push_outbox"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
