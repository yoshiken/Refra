import { db } from '@/lib/db';
import type { LocalSettings } from '@/types';

const DEFAULT_SETTINGS: LocalSettings = {
  theme: 'dark',
  thumbnailSize: 200,
  locale: 'ja',
};

export async function getSettings(): Promise<LocalSettings> {
  const record = await db.settings.get('default');
  return record?.value ?? DEFAULT_SETTINGS;
}

export async function updateSettings(partial: Partial<LocalSettings>): Promise<LocalSettings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await db.settings.put({ id: 'default', value: next });
  return next;
}
