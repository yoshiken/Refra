import Dexie from 'dexie';
import type { LocalSettings } from '@/types';

interface SettingsRecord {
  id: 'default';
  value: LocalSettings;
}

interface CompareRecord {
  id: 'selection';
  assetIds: string[];
}

class RefraDB extends Dexie {
  settings!: Dexie.Table<SettingsRecord, 'default'>;
  compare!: Dexie.Table<CompareRecord, 'selection'>;

  constructor() {
    super('refra');
    this.version(1).stores({
      settings: 'id',
    });
    this.version(2).stores({
      settings: 'id',
      compare: 'id',
    });
  }
}

export const db = new RefraDB();
