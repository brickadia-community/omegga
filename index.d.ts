import type Omegga from './src/omegga/server';

declare global {
  namespace NodeJS {
    interface Global {
      Omegga: typeof Omegga;
      VERBOSE: boolean;
    }
  }
}
export default global;
