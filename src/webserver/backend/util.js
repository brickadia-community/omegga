const path = require('path');
const fs = require('fs');

const crypto = require('crypto');
const pem = require('pem').promisified;

const soft = require('../../softconfig.js');

module.exports = {
  // generate SSL certs for the https server
  async getSSLKeys(dataPath) {
    const certsPath = path.join(dataPath, soft.WEB_CERTS_DATA);
    let certData;
    const now = Date.now();

    // read cert data from json file
    if (fs.existsSync(certsPath)) {
      try {
        certData = JSON.parse(fs.readFileSync(certsPath, 'utf8'));

        // make sure the cert is not expired
        if (certData.expires < now)
          certData = undefined;
      } catch (e) {
        // nothing to do here - probably bad json
      }
    }

    // otherwise generate it
    if (!certData) {
      // expires in half the real duration time
      const days = 360;
      const expires = now + (days/2) * 24 * 60 * 60 * 1000;
      try {
        const keys = await pem.createCertificate({ days, selfSigned: true });
        certData = { keys, expires };

        fs.writeFileSync(certsPath, JSON.stringify(certData));
        certData.new = true;
      } catch (e) {
        // probably missing openssl or something
      }
    }

    return certData;
  },

  // generate a session secret for the cookies
  getSessionSecret(dataPath) {
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
};