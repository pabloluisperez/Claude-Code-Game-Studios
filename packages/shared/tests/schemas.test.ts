import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema } from '../src/schemas/auth.js';
import { createClubSchema } from '../src/schemas/clubs.js';

describe('signupSchema', () => {
  it('accepts valid input', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123'
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'short'
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid username chars', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      username: 'has spaces',
      password: 'password123'
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid input', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'pw' });
    expect(result.success).toBe(true);
  });
});

describe('createClubSchema', () => {
  it('accepts valid club name and city', () => {
    const result = createClubSchema.safeParse({ name: 'FC Cascada', city: 'Madrid' });
    expect(result.success).toBe(true);
  });

  it('rejects name that is too short', () => {
    const result = createClubSchema.safeParse({ name: 'A', city: 'Madrid' });
    expect(result.success).toBe(false);
  });
});
