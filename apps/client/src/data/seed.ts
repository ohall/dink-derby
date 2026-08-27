import type { Catch, ChatMessage, Derby, DerbyParticipant, Reaction, User } from '@dink-derby/shared-types';
import { db } from '../db';
import { getOrCreateDeviceId } from '../utils/device';

export async function seedFieldDemo() {
  const existing = await db.settings.get('app');
  if (existing) return;

  const deviceId = await getOrCreateDeviceId();
  const now = new Date();
  const createdAt = now.toISOString();
  const updatedAt = createdAt;
  const users: User[] = [
    { id: 'demo-you', displayName: 'Oakley', createdAt, updatedAt: createdAt },
    { id: 'demo-maya', displayName: 'Maya Chen', createdAt, updatedAt: createdAt },
    { id: 'demo-ben', displayName: 'Ben Torres', createdAt, updatedAt: createdAt },
    { id: 'demo-jules', displayName: 'Jules Park', createdAt, updatedAt: createdAt },
  ];
  const derby: Derby = {
    id: 'demo-pine-lake',
    name: 'Pine Lake Throwdown',
    bodyOfWaterName: 'Pine Lake, Adirondacks',
    scoringMode: 'length',
    scoringUnit: 'in',
    scoringStyle: 'biggest',
    speciesFilter: 'Bass',
    inviteCode: 'DINK-PINE',
    status: 'active',
    createdByUserId: 'demo-you',
    startsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    isArchived: false,
    createdAt,
    updatedAt: createdAt,
  };
  const participants: DerbyParticipant[] = users.map((user, index) => ({
    id: `demo-member-${index + 1}`,
    derbyId: derby.id,
    userId: user.id,
    nickname: user.displayName,
    isAdmin: user.id === 'demo-you',
    createdAt,
  }));
  const catches: Catch[] = [
    {
      id: 'demo-catch-maya', derbyId: derby.id, userId: 'demo-maya', species: 'Largemouth bass',
      lengthInInches: 19.75, count: 1, note: 'Right off the reeds. New fish to beat.',
      caughtAt: new Date(now.getTime() - 48 * 60 * 1000).toISOString(), createdAt, updatedAt,
      clientId: deviceId, isPendingSync: false,
    },
    {
      id: 'demo-catch-ben', derbyId: derby.id, userId: 'demo-ben', species: 'Smallmouth bass',
      lengthInInches: 17.25, count: 1, note: 'That morning topwater bite is real.',
      caughtAt: new Date(now.getTime() - 92 * 60 * 1000).toISOString(), createdAt, updatedAt,
      clientId: deviceId, isPendingSync: false,
    },
    {
      id: 'demo-catch-you', derbyId: derby.id, userId: 'demo-you', species: 'Largemouth bass',
      lengthInInches: 14.5, count: 1, note: 'Tiny but emotionally significant.',
      caughtAt: new Date(now.getTime() - 116 * 60 * 1000).toISOString(), createdAt, updatedAt,
      clientId: deviceId, isPendingSync: false,
    },
  ];
  const messages: ChatMessage[] = [
    {
      id: 'demo-message-jules', derbyId: derby.id, userId: 'demo-jules',
      text: 'Nobody leaves until Maya tells us what lure that was.',
      sentAt: new Date(now.getTime() - 43 * 60 * 1000).toISOString(), createdAt, updatedAt,
      clientId: deviceId, isPendingSync: false,
    },
  ];
  const reactions: Reaction[] = [
    {
      id: 'demo-reaction-1', derbyId: derby.id, userId: 'demo-jules', targetType: 'catch',
      targetId: 'demo-catch-maya', reaction: 'fire', createdAt, updatedAt,
      clientId: deviceId, isPendingSync: false,
    },
    {
      id: 'demo-reaction-2', derbyId: derby.id, userId: 'demo-ben', targetType: 'catch',
      targetId: 'demo-catch-maya', reaction: 'fire', createdAt, updatedAt,
      clientId: deviceId, isPendingSync: false,
    },
  ];

  await db.transaction(
    'rw',
    [db.users, db.derbies, db.derbyParticipants, db.catches, db.chatMessages, db.reactions, db.settings],
    async () => {
      await db.users.bulkPut(users);
      await db.derbies.put(derby);
      await db.derbyParticipants.bulkPut(participants);
      await db.catches.bulkPut(catches);
      await db.chatMessages.bulkPut(messages);
      await db.reactions.bulkPut(reactions);
      await db.settings.put({ id: 'app', currentUserId: 'demo-you', seededAt: createdAt });
    },
  );
}
