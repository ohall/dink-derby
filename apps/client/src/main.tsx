import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Retire the old URL-keyed network cache; private data belongs in the active
// angler's IndexedDB, never in a service-worker cache shared across accounts.
if ('caches' in window) void caches.delete('supabase-api').catch(() => undefined);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
