import Omegga from '@omegga/server';

export const mockOmegga = () =>
  new Omegga(
    process.cwd(),
    { server: { port: 7777 } },
    { noauth: true, noweb: true, nodirs: true, noplugin: true },
  );
