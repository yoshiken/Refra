import { db } from '@/lib/db';

export async function getCompareAssets(): Promise<string[]> {
  const record = await db.compare.get('selection');
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

  await db.compare.put({ id: 'selection', assetIds: next });
  return next;
}

export async function clearCompareAssets(): Promise<string[]> {
  const next: string[] = [];
  await db.compare.put({ id: 'selection', assetIds: next });
  return next;
}
