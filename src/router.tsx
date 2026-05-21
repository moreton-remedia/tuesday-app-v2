import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithQueryClient } from '@tanstack/react-router-with-query';
import { toast } from 'sonner';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (typeof error === 'object' && error && 'status' in error && error.status !== 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'An error occurred');
        },
      },
    },
  });

  return routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      defaultPreload: 'intent',
      context: { queryClient },
      defaultViewTransition: false,
    }),
    queryClient,
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

