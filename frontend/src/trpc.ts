import type { AppRouter } from '@backend/router';
import { QueryClient } from '@tanstack/react-query';
import { TRPCClientError, httpSubscriptionLink } from '@trpc/client';
import { createTRPCReact, httpBatchLink, splitLink } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export const trpc = createTRPCReact<AppRouter>();

export function handleGlobalError(error: unknown) {
  if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
    location.reload();
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        if (
          error instanceof TRPCClientError &&
          error.data?.code === 'UNAUTHORIZED'
        )
          return false;
        return count < 2;
      },
      staleTime: 5000,
    },
    mutations: {
      onError: handleGlobalError,
    },
  },
});

queryClient.getQueryCache().subscribe(event => {
  if (event.type === 'updated' && event.action.type === 'error') {
    handleGlobalError(event.action.error);
  }
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
