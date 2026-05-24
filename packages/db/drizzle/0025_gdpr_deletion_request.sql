-- v1.0.x story 16 (sprint 16 adelantado): GDPR data-delete cooldown column.
-- NULL = no pending request. Set when user calls POST /me/delete-request.
-- Deletion executes 24h later via DELETE /me.

ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;
