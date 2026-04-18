const PREFIX = 'opencode-web:';

export function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setItem(key: string, value: unknown): void {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

export function removeItem(key: string): void {
  localStorage.removeItem(`${PREFIX}${key}`);
}
