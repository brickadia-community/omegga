import soft from '@/softconfig';
import crypto from 'node:crypto';
import type { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import pem from 'pem';

const createCertificate: (
  options: pem.CertificateCreationOptions,
) => Promise<pem.CertificateCreationResult> = promisify(pem.createCertificate);

// generate SSL certs for the https server
export async function getSSLKeys(dataPath: string) {
  const certsPath = path.join(dataPath, soft.WEB_CERTS_DATA);
  let certData;
  const now = Date.now();

  // read cert data from json file
  if (fs.existsSync(certsPath)) {
    try {
      certData = JSON.parse(fs.readFileSync(certsPath, 'utf8'));

      // make sure the cert is not expired
      if (certData.expires < now) certData = undefined;
    } catch (e) {
      // nothing to do here - probably bad json
    }
  }

  // otherwise generate it
  if (!certData) {
    // expires in half the real duration time
    const days = 360;
    const expires = now + (days / 2) * 24 * 60 * 60 * 1000;
    try {
      const keys = await createCertificate({ days, selfSigned: true });
      certData = { keys, expires, new: false };

      fs.writeFileSync(certsPath, JSON.stringify(certData));
      certData.new = true;
    } catch (e) {
      // probably missing openssl or something
    }
  }

  return certData;
}

// generate a session secret for the cookies
export function getSessionSecret(dataPath: string) {
  const tokenPath = path.join(dataPath, soft.WEB_SESSION_TOKEN);
  const secretSize = 64;
  let secret;
  // read secret from file
  if (fs.existsSync(tokenPath)) {
    try {
      secret = fs.readFileSync(tokenPath, 'utf8');
    } catch (e) {
      // nothing to do here - probably file is a folder or something
    }
  }

  if (!secret) {
    // generate a new secret
    const buf = Buffer.alloc(secretSize);
    secret = crypto.randomFillSync(buf).toString('hex');
    try {
      // write secret to file
      fs.writeFileSync(tokenPath, secret);
    } catch (e) {
      // nothing to do here - maybe missing perms?
    }
  }

  return secret;
}

/**
 * Race an event listener against a timeout. Subscribes to `event` on
 * `emitter`, invoking `check` on every emission. Resolves with the first
 * truthy return value from `check`, or `false` after `ms` milliseconds.
 * Cleans up the listener in both cases.
 */
export function waitForEvent<T>(
  emitter: EventEmitter,
  event: string,
  check: (...args: any[]) => T | false | undefined,
  ms = 5000,
): Promise<T | false> {
  return new Promise<T | false>(resolve => {
    const timer = setTimeout(() => {
      emitter.off(event, listener);
      resolve(false);
    }, ms);

    function listener(...args: any[]) {
      const result = check(...args);
      if (result) {
        clearTimeout(timer);
        emitter.off(event, listener);
        resolve(result);
      }
    }

    emitter.on(event, listener);
  });
}
