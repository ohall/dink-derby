import { db, type CatchDraft } from '../db';
import { isDerbyInHistory } from '../domain/derbyLifecycle';

export async function openCatchDraft(derbyId: string, userId: string, defaultSpecies = ''): Promise<CatchDraft> {
  return db.transaction('rw', db.catchDrafts, async () => {
    const existing = await db.catchDrafts.where('[derbyId+userId]').equals([derbyId, userId]).first();
    const draft: CatchDraft = existing ?? {
      id: crypto.randomUUID(), derbyId, userId, measurement: '',
      species: defaultSpecies, note: '', isOpen: true, updatedAt: new Date().toISOString(),
    };
    draft.includeLocation ??= true;
    draft.isOpen = true;
    draft.updatedAt = new Date().toISOString();
    await db.catchDrafts.put(draft);
    return draft;
  });
}

export async function resumableCatchDraft(userId: string) {
  const drafts = await db.catchDrafts.where('userId').equals(userId).filter(draft => draft.isOpen).sortBy('updatedAt');
  const settings = await db.settings.get('app');
  for (const draft of drafts.reverse()) {
    const derby = await db.derbies.get(draft.derbyId);
    if (derby && !isDerbyInHistory(derby, settings?.removedDerbyIds)) return draft;
  }
}
