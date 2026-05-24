import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { sessions, users } from './schema/index.js';
import type { Session, User } from './schema/index.js';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15; // 15 days

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

function tokenToSessionId(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(token: string, userId: string): Promise<Session> {
  const sessionId = tokenToSessionId(token);
  const session: typeof sessions.$inferInsert = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS)
  };
  await db.insert(sessions).values(session);
  return session as Session;
}

export async function validateSessionToken(
  token: string
): Promise<{ session: Session; user: User } | null> {
  const sessionId = tokenToSessionId(token);
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: { user: true }
  });
  if (!row) return null;

  if (Date.now() >= row.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Sliding expiration
  if (Date.now() >= row.expiresAt.getTime() - SESSION_REFRESH_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
    row.expiresAt = newExpiry;
  }

  return { session: row as Session, user: row.user as User };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
