import { TOTP, Secret } from 'otpauth';

const ISSUER = 'Omegga';
const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = 'SHA1';

function makeTOTP(secret: string, label = ''): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

export function generateSecret(): string {
  return new Secret().base32;
}

export function generateToken(secret: string): string {
  return makeTOTP(secret).generate();
}

export function verifyToken(
  token: string,
  secret: string,
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const delta = makeTOTP(secret).validate({ token, window });
  return delta !== null;
}

export function generateURI(secret: string, username: string): string {
  return makeTOTP(secret, username).toString();
}
