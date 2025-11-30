import { describe, it, expect } from 'vitest';
import { CatchSchema, UserSchema } from './index';

describe('Shared Schemas', () => {
  describe('UserSchema', () => {
    it('validates a correct user', () => {
      const validUser = {
        id: 'user_123',
        displayName: 'Trout Master',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = UserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const invalidUser = {
        displayName: 'No ID User',
      };
      const result = UserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });

  describe('CatchSchema', () => {
    it('validates a correct catch', () => {
      const validCatch = {
        id: 'catch_abc',
        derbyId: 'derby_xyz',
        userId: 'user_123',
        count: 1,
        caughtAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientId: 'device_1',
        isPendingSync: true,
      };
      const result = CatchSchema.safeParse(validCatch);
      expect(result.success).toBe(true);
    });
  });
});
