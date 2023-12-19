import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pem from 'pem';
import { promisify } from 'util';
import soft from '@/softconfig';

const createCertificate: (
  options: pem.CertificateCreationOptions
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
      console.error('1)', e);
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
      console.error('2)', e);
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
