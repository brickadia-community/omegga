const allowedKeys = ['omegga', 'credentials', 'server'];

// low effort js object validation
module.exports = obj => {
  if (typeof obj !== 'object')
    return {valid: false, errors: ['not an object']};

  if (Object.keys(obj).some(k => !allowedKeys.includes(k)))
    return {valid: false, errors: ['contains invalid keys']};

  if (!obj.server || typeof obj.server !== 'object')
    return {valid: false, errors: ['missing/invalid server category']};

  if (typeof obj.server.port !== 'number')
    return {valid: false, errors: ['server.port must be a number']};

  if (obj.server.branch && typeof obj.server.branch !== 'string')
    return {valid: false, errors: ['server.branch must be a string']};

  if (obj.omegga) {
    if (typeof obj.omegga !== 'object')
      return {valid: false, errors: ['invalid omegga category']};

    if (typeof obj.omegga.port !== 'undefined' && typeof obj.omegga.port !== 'number')
      return {valid: false, errors: ['omegga.port must be a nubmer']};
  }

  return {valid: true, errors: []};
};