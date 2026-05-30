import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAdmin } from '../src/routes/admin.js';

describe('admin routes - isAdmin function', () => {
  let logSpy, warnSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('isAdmin validation', () => {
    it('should return true for authorized admin email', () => {
      const adminEmails = ['admin@admin.com', 'support@admin.com'];
      const result = isAdmin('admin@admin.com', adminEmails);
      expect(result).toBe(true);
    });

    it('should return true for admin email with different case', () => {
      const adminEmails = ['admin@admin.com'];
      const result = isAdmin('ADMIN@ADMIN.COM', adminEmails);
      expect(result).toBe(true);
    });

    it('should return true for admin email with whitespace', () => {
      const adminEmails = ['admin@admin.com'];
      const result = isAdmin(' admin@admin.com ', adminEmails);
      expect(result).toBe(true);
    });

    it('should return false for unauthorized email', () => {
      const adminEmails = ['admin@admin.com'];
      const result = isAdmin('user@example.com', adminEmails);
      expect(result).toBe(false);
    });

    it('should return false for empty email', () => {
      const adminEmails = ['admin@admin.com'];
      const result = isAdmin('', adminEmails);
      expect(result).toBe(false);
    });

    it('should return false for null/undefined email', () => {
      const adminEmails = ['admin@admin.com'];
      expect(isAdmin(null, adminEmails)).toBe(false);
      expect(isAdmin(undefined, adminEmails)).toBe(false);
    });
  });

  describe('admin access logging', () => {
    it('should log successful admin access with timestamp', () => {
      const adminEmails = ['admin@admin.com'];
      const testEmail = 'admin@admin.com';
      isAdmin(testEmail, adminEmails);

      expect(logSpy).toHaveBeenCalledOnce();
      const logCall = logSpy.mock.calls[0][0];
      expect(logCall).toContain('[Admin] Access granted to');
      expect(logCall).toContain(testEmail);
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    });

    it('should log rejected access attempt with timestamp', () => {
      const adminEmails = ['admin@admin.com'];
      const testEmail = 'user@example.com';
      isAdmin(testEmail, adminEmails);

      expect(warnSpy).toHaveBeenCalledOnce();
      const warnCall = warnSpy.mock.calls[0][0];
      expect(warnCall).toContain('[Admin] Unauthorized access attempt from');
      expect(warnCall).toContain(testEmail);
      expect(warnCall).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    });

    it('should not log when neither authorized nor rejected (negative case)', () => {
      const adminEmails = ['admin@admin.com'];
      isAdmin('user@example.com', adminEmails);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should use warn for unauthorized and log for authorized', () => {
      const adminEmails = ['admin@admin.com'];

      // Authorized attempt
      isAdmin('admin@admin.com', adminEmails);
      expect(logSpy).toHaveBeenCalledOnce();
      expect(warnSpy).not.toHaveBeenCalled();

      logSpy.mockClear();
      warnSpy.mockClear();

      // Unauthorized attempt
      isAdmin('hacker@example.com', adminEmails);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should create audit trail with multiple attempts', () => {
      const adminEmails = ['admin@admin.com'];

      // Multiple authorized attempts
      isAdmin('admin@admin.com', adminEmails);
      isAdmin('admin@admin.com', adminEmails);

      // Multiple unauthorized attempts
      isAdmin('attacker1@example.com', adminEmails);
      isAdmin('attacker2@example.com', adminEmails);

      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty admin list', () => {
      const adminEmails = [];
      const result = isAdmin('anyone@example.com', adminEmails);
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle multiple admin emails', () => {
      const adminEmails = ['admin1@admin.com', 'admin2@admin.com', 'support@admin.com'];

      expect(isAdmin('admin1@admin.com', adminEmails)).toBe(true);
      expect(isAdmin('admin2@admin.com', adminEmails)).toBe(true);
      expect(isAdmin('support@admin.com', adminEmails)).toBe(true);
      expect(isAdmin('other@admin.com', adminEmails)).toBe(false);

      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should preserve original email in logs', () => {
      const adminEmails = ['admin@admin.com'];
      const testEmail = 'Admin@Admin.Com';
      isAdmin(testEmail, adminEmails);

      const logCall = logSpy.mock.calls[0][0];
      expect(logCall).toContain(testEmail); // Original case preserved
    });
  });
});

describe('admin routes - integration tests', () => {
  let logSpy, warnSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should provide isAdmin for use in route handlers', () => {
    // This tests that isAdmin is properly exported and available
    const adminEmails = ['admin@admin.com'];
    expect(typeof isAdmin).toBe('function');
    expect(isAdmin('admin@admin.com', adminEmails)).toBe(true);
  });

  it('should normalize email to lowercase for comparison but preserve original in logs', () => {
    const adminEmails = ['admin@admin.com'];

    // Test with mixed case
    const result1 = isAdmin('ADMIN@ADMIN.COM', adminEmails);
    expect(result1).toBe(true);

    const logCall = logSpy.mock.calls[0][0];
    expect(logCall).toContain('ADMIN@ADMIN.COM'); // Original preserved

    logSpy.mockClear();

    // Test with spaces
    const result2 = isAdmin('  admin@admin.com  ', adminEmails);
    expect(result2).toBe(true);

    const logCall2 = logSpy.mock.calls[0][0];
    expect(logCall2).toContain('  admin@admin.com  '); // Original preserved
  });
});
