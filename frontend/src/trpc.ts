import type { AppRouter } from '@backend/router';
import { QueryClient } from '@tanstack/react-query';
import { httpSubscriptionLink } from '@trpc/client';
import { createTRPCReact, httpBatchLink, splitLink } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5000,
    },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: op => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: '/trpc',
        eventSourceOptions: { withCredentials: true },
      }),
      false: httpBatchLink({
        url: '/trpc',
        fetch: (url, opts) => fetch(url, { ...opts, credentials: 'include' }),
      }),
    }),
  ],
});
