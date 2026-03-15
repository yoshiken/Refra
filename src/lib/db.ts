import Dexie from 'dexie';
import type { LocalSettings } from '@/types';

interface SettingsRecord {
  id: 'default';
  value: LocalSettings;
}

class RefraDB extends Dexie {
  settings!: Dexie.Table<SettingsRecord, 'default'>;

  constructor() {
    super('refra');
    this.version(1).stores({
      settings: 'id',
    });
  }
}

export const db = new RefraDB();
