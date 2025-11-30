import Dexie, { Table } from 'dexie';
import { 
  User, 
  Derby, 
  DerbyParticipant, 
  Catch, 
  ChatMessage, 
  SyncOutboxItem,
  Device
} from '@dink-derby/shared-types';

export class DinkDerbyDatabase extends Dexie {
  users!: Table<User, string>;
  derbies!: Table<Derby, string>;
  derbyParticipants!: Table<DerbyParticipant, string>;
  catches!: Table<Catch, string>;
  chatMessages!: Table<ChatMessage, string>;
  syncOutbox!: Table<SyncOutboxItem, string>;
  device!: Table<Device, string>;

  constructor() {
    super('DinkDerbyDB');
    
    this.version(1).stores({
      users: 'id',
      derbies: 'id',
      derbyParticipants: 'id, derbyId, userId',
      catches: 'id, derbyId, userId, isPendingSync, caughtAt',
      chatMessages: 'id, derbyId, isPendingSync, sentAt',
      syncOutbox: 'id, createdAt',
      device: 'id' // Should only have one row usually
    });
  }
}

export const db = new DinkDerbyDatabase();
