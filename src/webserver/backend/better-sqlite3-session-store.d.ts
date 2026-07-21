declare module 'better-sqlite3-session-store' {
  import type session from 'express-session';

  type StoreConstructor = new (options: {
    client: unknown;
    expired?: { clear: boolean; intervalMs: number };
  }) => session.Store;

  // the package is CJS; depending on the bundler interop it may be accessed
  // directly or through a `default` property
  interface SessionStoreFactory {
    (s: typeof session): StoreConstructor;
    default?: SessionStoreFactory;
  }

  const factory: SessionStoreFactory;
  export = factory;
}
