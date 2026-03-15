import Dexie from 'dexie';

interface CompareSelection {
  id: 'selection';
  assetIds: string[];
}

class CompareDB extends Dexie {
  compare!: Dexie.Table<CompareSelection, 'selection'>;

  constructor() {
    super('refra-compare');
    this.version(1).stores({
      compare: 'id',
    });
  }
}

const compareDb = new CompareDB();

export async function getCompareAssets(): Promise<string[]> {
  const record = await compareDb.compare.get('selection');
  return record?.assetIds ?? [];
}

export async function addCompareAsset(assetId: string): Promise<string[]> {
  const current = await getCompareAssets();
  const exists = current.includes(assetId);
  const next = exists
    ? current.filter((id) => id !== assetId)
    : current.length >= 4
      ? current
      : [...current, assetId];

  await compareDb.compare.put({ id: 'selection', assetIds: next });
  return next;
}

export async function clearCompareAssets(): Promise<string[]> {
  const next: string[] = [];
  await compareDb.compare.put({ id: 'selection', assetIds: next });
  return next;
}
