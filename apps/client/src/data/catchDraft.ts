import { db, type CatchDraft } from '../db';

export async function openCatchDraft(derbyId: string, userId: string, defaultSpecies = ''): Promise<CatchDraft> {
  return db.transaction('rw', db.catchDrafts, async () => {
    const existing = await db.catchDrafts.where('[derbyId+userId]').equals([derbyId, userId]).first();
    const draft: CatchDraft = existing ?? {
      id: crypto.randomUUID(), derbyId, userId, measurement: '',
      species: defaultSpecies, note: '', isOpen: true, updatedAt: new Date().toISOString(),
    };
    draft.isOpen = true;
    draft.updatedAt = new Date().toISOString();
    await db.catchDrafts.put(draft);
    return draft;
  });
}

export async function resumableCatchDraft(userId: string) {
  const drafts = await db.catchDrafts.where('userId').equals(userId).filter(draft => draft.isOpen).sortBy('updatedAt');
  return drafts[drafts.length - 1];
}
