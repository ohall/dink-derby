import { db } from '../db';
import { Device } from '@dink-derby/shared-types';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await db.device.toArray();
  
  if (existing.length > 0) {
    return existing[0].id;
  }

  const newDevice: Device = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await db.device.add(newDevice);
  return newDevice.id;
}
