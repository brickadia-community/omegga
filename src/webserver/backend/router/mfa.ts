import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { z } from 'zod/v4';
import { ScopeName } from '../scopes';
import { generateSecret, generateURI, verifyToken } from '../totp';
import { getContextDeps, protectedProcedure, router } from '../trpc';

function getRpID(req: import('express').Request): string {
  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {}
  }
  return req.hostname;
}

async function requirePassword(ctx: any, password: string): Promise<boolean> {
  return bcrypt.compare(password, ctx.user.hash);
}

export const mfaRouter = router({
  mfa: router({
    status: protectedProcedure(ScopeName.SessionInfo).query(({ ctx }) => {
      const user = ctx.user;
      return {
        totpEnabled: user.totpEnabled ?? false,
        passkeys: (user.passkeys ?? []).map(p => ({
          id: p.id,
          name: p.name,
          created: p.created,
          lastUsed: p.lastUsed,
        })),
        hasRecoveryCodes: (user.recoveryCodes?.length ?? 0) > 0,
      };
    }),

    totp: router({
      setup: protectedProcedure(ScopeName.SessionInfo)
        .input(z.object({ password: z.string() }))
        .mutation(async ({ input, ctx }) => {
          if (!(await requirePassword(ctx, input.password))) {
            return { error: 'incorrect password' };
          }
          const secret = generateSecret();
          const uri = generateURI(secret, ctx.user.username || 'Admin');
          const qrCode = await QRCode.toDataURL(uri);
          // store secret in session so enable can't accept arbitrary secrets
          (ctx.req as any).session.pendingTotpSecret = secret;
          (ctx.req as any).session.save();
          return { secret, uri, qrCode };
        }),

      enable: protectedProcedure(ScopeName.SessionInfo)
        .input(z.object({ code: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { database } = getContextDeps();
          const secret = (ctx.req as any).session.pendingTotpSecret;
          if (!secret) return 'no pending TOTP setup';
          if (!verifyToken(input.code, secret)) {
            return 'invalid code';
          }
          await database.setUserTotp(ctx.user.username, secret, true);
          delete (ctx.req as any).session.pendingTotpSecret;
          (ctx.req as any).session.save();
          return '';
        }),

      disable: protectedProcedure(ScopeName.SessionInfo)
        .input(z.object({ password: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { database } = getContextDeps();
          if (!(await requirePassword(ctx, input.password))) {
            return 'incorrect password';
          }
          await database.disableUserTotp(ctx.user.username);
          return '';
        }),
    }),

    passkey: router({
      registerOptions: protectedProcedure(ScopeName.SessionInfo).mutation(
        async ({ ctx }) => {
          const rpID = getRpID(ctx.req);
          const options = await generateRegistrationOptions({
            rpName: 'Omegga',
            rpID,
            userName: ctx.user.username || 'Admin',
            excludeCredentials: (ctx.user.passkeys ?? []).map(p => ({
              id: p.id,
              transports: p.transports as any,
            })),
            authenticatorSelection: {
              residentKey: 'preferred',
              userVerification: 'preferred',
            },
          });
          (ctx.req as any).session.mfaChallenge = options.challenge;
          (ctx.req as any).session.save();
          return options;
        },
      ),

      register: protectedProcedure(ScopeName.SessionInfo)
        .input(
          z.object({
            credential: z.any(),
            name: z.string().max(64).default('Passkey'),
          }),
        )
        .mutation(async ({ input, ctx }) => {
          const { database } = getContextDeps();
          const challenge = (ctx.req as any).session.mfaChallenge;
          if (!challenge) return 'no pending challenge';
          // clear challenge immediately to prevent replay
          delete (ctx.req as any).session.mfaChallenge;
          (ctx.req as any).session.save();
          try {
            const verification = await verifyRegistrationResponse({
              response: input.credential,
              expectedChallenge: challenge,
              expectedOrigin:
                ctx.req.headers.origin ??
                `${ctx.req.protocol}://${ctx.req.get('host')}`,
              expectedRPID: getRpID(ctx.req),
            });
            if (!verification.verified || !verification.registrationInfo) {
              return 'verification failed';
            }
            const { credential } = verification.registrationInfo;
            await database.addPasskey(ctx.user.username, {
              id: credential.id,
              publicKey: Buffer.from(credential.publicKey).toString(
                'base64url',
              ),
              counter: credential.counter,
              name: input.name,
              created: Date.now(),
              lastUsed: 0,
              transports: input.credential.response?.transports,
            });
            return '';
          } catch (e) {
            console.error('Passkey registration error:', e);
            return 'registration failed';
          }
        }),

      remove: protectedProcedure(ScopeName.SessionInfo)
        .input(z.object({ id: z.string(), password: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { database } = getContextDeps();
          if (!(await requirePassword(ctx, input.password))) {
            return 'incorrect password';
          }
          await database.removePasskey(ctx.user.username, input.id);
          return '';
        }),
    }),

    recoveryCodes: router({
      generate: protectedProcedure(ScopeName.SessionInfo)
        .input(z.object({ password: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { database } = getContextDeps();
          if (!(await requirePassword(ctx, input.password))) {
            return { error: 'incorrect password' };
          }
          const codes: string[] = [];
          const hashes: string[] = [];
          for (let i = 0; i < 10; i++) {
            const code = crypto.randomBytes(5).toString('hex');
            codes.push(code);
            hashes.push(await bcrypt.hash(code, 10));
          }
          await database.setRecoveryCodes(ctx.user.username, hashes);
          return { codes };
        }),
    }),
  }),
});
