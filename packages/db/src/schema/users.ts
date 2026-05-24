import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sessions } from './sessions.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  username: text('username').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // v1.0.x story 16: GDPR data-delete cooldown. NULL = no pending request;
  // set when user calls POST /me/delete-request. Deletion executes 24h later.
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true })
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions)
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
