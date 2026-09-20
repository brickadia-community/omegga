import Logger from '@/logger';
import type express from 'express';

/** An error carrying the status the client should see instead of a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Express 4 does not forward a rejected promise to the error handler: the
 * rejection reaches the process, where omegga rethrows it and stops the game
 * server. Every async route goes through here.
 */
export const asyncRoute =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

/**
 * express-session leaves req.session undefined on requests it declines, like a
 * request target that is not a path (`OPTIONS *`).
 */
export const requireSession: express.RequestHandler = (req, res, next) =>
  req.session ? next() : res.status(400).json({ message: 'no session' });

/**
 * Last in the chain, so a request that failed answers with a status instead of
 * taking omegga down. Express recognizes an error handler by its four
 * parameters, which is why `next` is here unused.
 */
export const errorHandler: express.ErrorRequestHandler = (
  err,
  _req,
  res,
  next,
) => {
  // the response is already on the wire; only express' default handler can
  // destroy the socket from here
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  Logger.errorp('Unhandled webserver request error:', err);
  res.status(500).json({ message: 'internal error' });
};
