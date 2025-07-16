import { IConfig } from './types';

const allowedKeys = ['omegga', 'credentials', 'server'];

// low effort js object validation
const validate = (obj: Partial<IConfig>) => {
  if (typeof obj !== 'object')
    return { valid: false, errors: ['not an object'] };

  if (Object.keys(obj).some(k => !allowedKeys.includes(k)))
    return { valid: false, errors: ['contains invalid keys'] };

  if (!('server' in obj) || typeof obj?.server !== 'object')
    return { valid: false, errors: ['missing/invalid server category'] };

  if (typeof obj.server.port !== 'number')
    return { valid: false, errors: ['server.port must be a number'] };

  const strings = ['branch', 'authDir', 'savedDir', 'launchArgs'];
  for (const s of strings) {
    if (obj.server[s] && typeof obj.server[s] !== 'string')
      return { valid: false, errors: [`server.${s} must be a string`] };
  }

  if (obj.omegga) {
    if (typeof obj.omegga !== 'object')
      return { valid: false, errors: ['invalid omegga category'] };

    if (
      typeof obj.omegga.port !== 'undefined' &&
      typeof obj.omegga.port !== 'number'
    )
      return { valid: false, errors: ['omegga.port must be a number'] };
  }

  return { valid: true, errors: [] };
};

export default validate;
