declare module 'update-notifier-cjs' {
  interface UpdateInfo {
    latest: string;
    current: string;
    type: string;
    name: string;
  }

  interface NotifyOptions {
    defer?: boolean;
    message?: string;
    isGlobal?: boolean;
  }

  interface UpdateNotifier {
    /** set when a newer published version was found */
    update?: UpdateInfo;
    notify(options?: NotifyOptions): void;
  }

  function updateNotifier(options: {
    pkg: { name: string; version: string } & Record<string, unknown>;
    updateCheckInterval?: number;
  }): UpdateNotifier;

  export = updateNotifier;
}
