import { EventEmitter } from 'events';

// Shared event bus for tRPC subscriptions.
// Producers (metrics.ts, omegga event handlers) emit here;
// subscription resolvers in the router consume these events.
export const serverEvents = new EventEmitter();
serverEvents.setMaxListeners(50);
