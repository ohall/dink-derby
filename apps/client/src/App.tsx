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
import { syncService } from './sync';

// --- Components ---
import { DerbyList } from './components/DerbyList';
import { CreateDerbyForm } from './components/CreateDerbyForm';
import { DerbyDetails } from './components/DerbyDetails';
import { LogCatchForm } from './components/LogCatchForm';
import { EditProfile } from './components/EditProfile';
import { Header } from './components/Header';

// --- Setup ---
const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
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

const createDerbyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/new',
  component: CreateDerbyForm,
});

const derbyDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/derbies/$derbyId',
  component: DerbyDetails,
});

const logCatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/derbies/$derbyId/log-catch',
  component: LogCatchForm,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: EditProfile,
});

const routeTree = rootRoute.addChildren([
  indexRoute, 
  createDerbyRoute, 
  derbyDetailsRoute,
  logCatchRoute,
  profileRoute
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getOrCreateDeviceId().then(() => {
      setReady(true);
      syncService.start();
    });
  }, []);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce">🐟</div>
        <div className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>Loading Dink Derby...</div>
      </div>
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
