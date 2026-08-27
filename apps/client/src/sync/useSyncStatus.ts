import { useSyncExternalStore } from 'react';
import { syncService } from './index';

export function useSyncStatus() {
  return useSyncExternalStore(syncService.subscribe, syncService.getSnapshot, syncService.getSnapshot);
}
