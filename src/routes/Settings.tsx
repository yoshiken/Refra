import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '@/stores/settingsStore';
import type { LocalSettings } from '@/types';

export default function Settings() {
  const [settings, setSettings] = useState<LocalSettings>({
    theme: 'dark',
    thumbnailSize: 200,
    locale: 'ja',
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const next = await getSettings();
        setSettings(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : '設定の読み込みに失敗しました');
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  const save = async (partial: Partial<LocalSettings>) => {
    try {
      const next = await updateSettings(partial);
      setSettings(next);
      setStatus('設定を保存しました');
      setTimeout(() => setStatus(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : '設定の保存に失敗しました');
    }
  };

  return (
    <div className="p-8">
      <main className="mx-auto max-w-xl space-y-4 rounded border border-border-primary bg-bg-secondary p-6">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-text-secondary">設定はこのブラウザにのみ保存されます。</p>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">テーマ</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm ${settings.theme === 'dark' ? 'bg-bg-tertiary font-semibold' : 'bg-bg-primary'}`}
              onClick={() => void save({ theme: 'dark' })}
            >
              ダーク
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm ${settings.theme === 'light' ? 'bg-bg-tertiary font-semibold' : 'bg-bg-primary'}`}
              onClick={() => void save({ theme: 'light' })}
            >
              ライト
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">デフォルトサムネイルサイズ: {settings.thumbnailSize}px</h2>
          <input
            type="range"
            min={120}
            max={320}
            step={10}
            className="w-full"
            value={settings.thumbnailSize}
            onChange={(e) => void save({ thumbnailSize: Number(e.target.value) })}
          />
        </section>

        {status && <p className="rounded border border-border-primary bg-bg-tertiary p-2 text-xs">{status}</p>}
        {error && <p className="rounded border border-red-500/50 bg-red-500/10 p-2 text-xs">{error}</p>}
      </main>
    </div>
  );
}
