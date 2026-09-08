import type { Catch, Derby } from '@dink-derby/shared-types';

export function isDerbyComplete(derby: Derby, now = Date.now()) {
  return derby.status === 'finished' || !!(derby.endsAt && Date.parse(derby.endsAt) <= now);
}

export function isDerbyInHistory(derby: Derby, removedDerbyIds: readonly string[] = []) {
  return isDerbyComplete(derby) || removedDerbyIds.includes(derby.id);
}

export function catchWithinDerby(derby: Derby, item: Catch) {
  return !item.deletedAt && (!derby.endsAt || Date.parse(item.caughtAt) <= Date.parse(derby.endsAt));
}
