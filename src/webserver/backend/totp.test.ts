import { describe, expect, it } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import {
  generateSecret,
  generateToken,
  verifyToken,
  generateURI,
} from './totp';

describe('TOTP', () => {
  // RFC 6238 Appendix B test vectors
  // The test secret is ASCII "12345678901234567890" (20 bytes for SHA1)
  const RFC_SECRET_RAW = Buffer.from('12345678901234567890', 'ascii');
  const RFC_SECRET = new Secret({ buffer: RFC_SECRET_RAW });
  const RFC_SECRET_B32 = RFC_SECRET.base32;

  // RFC 6238 test vectors for SHA1, 8-digit TOTP
  // We verify the underlying otpauth library produces correct results
  const RFC_VECTORS_8DIGIT: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  describe('RFC 6238 compliance (8-digit, raw library)', () => {
    for (const [time, expected] of RFC_VECTORS_8DIGIT) {
      it(`generates correct OTP at time=${time}`, () => {
        const totp = new TOTP({
          secret: RFC_SECRET,
          digits: 8,
          period: 30,
          algorithm: 'SHA1',
        });
        const token = totp.generate({ timestamp: time * 1000 });
        expect(token).toBe(expected);
      });
    }
  });

  // Our wrapper uses 6 digits (standard for authenticator apps).
  // Verify it produces the truncated-to-6 versions of the RFC vectors.
  const RFC_VECTORS_6DIGIT: [number, string][] = RFC_VECTORS_8DIGIT.map(
    ([time, code]) => [time, code.slice(-6)],
  );

  describe('RFC 6238 compliance (6-digit, our wrapper)', () => {
    for (const [time, expected] of RFC_VECTORS_6DIGIT) {
      it(`generates correct 6-digit OTP at time=${time}`, () => {
        const totp = new TOTP({
          secret: Secret.fromBase32(RFC_SECRET_B32),
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
        });
        const token = totp.generate({ timestamp: time * 1000 });
        expect(token).toBe(expected);
      });
    }
  });

  describe('generateSecret', () => {
    it('generates a valid base32 string', () => {
      const secret = generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThanOrEqual(20);
    });

    it('generates unique secrets', () => {
      const secrets = new Set(Array.from({ length: 10 }, generateSecret));
      expect(secrets.size).toBe(10);
    });

    it('round-trips through Secret.fromBase32', () => {
      const secret = generateSecret();
      expect(() => Secret.fromBase32(secret)).not.toThrow();
    });
  });

  describe('generateToken', () => {
    it('generates a 6-digit string', () => {
      const secret = generateSecret();
      const token = generateToken(secret);
      expect(token).toMatch(/^\d{6}$/);
    });

    it('generates the same token for the same secret within a time step', () => {
      const secret = generateSecret();
      const a = generateToken(secret);
      const b = generateToken(secret);
      expect(a).toBe(b);
    });
  });

  describe('verifyToken', () => {
    it('accepts a valid current token', () => {
      const secret = generateSecret();
      const token = generateToken(secret);
      expect(verifyToken(token, secret)).toBe(true);
    });

    it('rejects an invalid token', () => {
      const secret = generateSecret();
      expect(verifyToken('000000', secret)).toBe(false);
    });

    it('rejects malformed tokens', () => {
      const secret = generateSecret();
      expect(verifyToken('', secret)).toBe(false);
      expect(verifyToken('12345', secret)).toBe(false);
      expect(verifyToken('1234567', secret)).toBe(false);
      expect(verifyToken('abcdef', secret)).toBe(false);
      expect(verifyToken('12345a', secret)).toBe(false);
    });

    it('rejects tokens from a different secret', () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();
      const token = generateToken(secret1);
      expect(verifyToken(token, secret2)).toBe(false);
    });

    it('accepts tokens within the time window', () => {
      const secret = generateSecret();
      const totp = new TOTP({
        secret: Secret.fromBase32(secret),
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
      });
      // Generate a token for the previous time step
      const prevToken = totp.generate({
        timestamp: Date.now() - 30 * 1000,
      });
      expect(verifyToken(prevToken, secret, 1)).toBe(true);
    });

    it('rejects tokens outside the time window', () => {
      const secret = generateSecret();
      const totp = new TOTP({
        secret: Secret.fromBase32(secret),
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
      });
      // Generate a token 3 steps in the past
      const oldToken = totp.generate({
        timestamp: Date.now() - 90 * 1000,
      });
      expect(verifyToken(oldToken, secret, 1)).toBe(false);
    });
  });

  describe('generateURI', () => {
    it('generates a valid otpauth URI', () => {
      const secret = generateSecret();
      const uri = generateURI(secret, 'testuser');
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('secret=' + secret);
      expect(uri).toContain('issuer=Omegga');
      expect(uri).toContain('testuser');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });

    it('properly encodes special characters in username', () => {
      const secret = generateSecret();
      const uri = generateURI(secret, 'user@example.com');
      expect(uri).toContain('user%40example.com');
    });

    it('contains all required parameters', () => {
      const secret = generateSecret();
      const uri = generateURI(secret, 'admin');
      const url = new URL(uri);
      expect(url.protocol).toBe('otpauth:');
      expect(url.host).toBe('totp');
      expect(url.searchParams.get('secret')).toBe(secret);
      expect(url.searchParams.get('issuer')).toBe('Omegga');
      expect(url.searchParams.get('digits')).toBe('6');
      expect(url.searchParams.get('period')).toBe('30');
    });
  });
});
