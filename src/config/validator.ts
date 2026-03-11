import { ConfigSchema } from './types';

const validate = (obj: unknown) => {
  const result = ConfigSchema.safeParse(obj);
  if (result.success) {
    return { valid: true as const, errors: [] as string[] };
  }
  return {
    valid: false as const,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
};

export default validate;
