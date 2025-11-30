import { useEffect, useState } from 'react';
import {
  Outlet,
  RouterProvider,
  Link,
  createRouter,
  createRoute,
  createRootRoute,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getOrCreateDeviceId } from './utils/device';

// --- Components ---
import { DerbyList } from './components/DerbyList';

// --- Setup ---
const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <header className="bg-emerald-800 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-bold tracking-tighter">
            🐟 Dink Derby
          </Link>
          <div className="text-xs opacity-70">Offline-First Beta</div>
        </div>
      </header>
      <main className="flex-1 container mx-auto p-4">
        <Outlet />
      </main>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DerbyList,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getOrCreateDeviceId().then(() => setReady(true));
  }, []);

  if (!ready) return <div className="p-4">Loading device...</div>;

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
