const cache = new Map<string, Promise<string>>();

export function getVideoBlobUrl(url: string): Promise<string> {
  const existing = cache.get(url);
  if (existing) return existing;

  const promise = fetch(url)
    .then((res) => res.blob())
    .then((blob) => URL.createObjectURL(blob));

  cache.set(url, promise);
  return promise;
}
