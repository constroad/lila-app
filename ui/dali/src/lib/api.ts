/**
 * El cliente de `/api/dali/*`: mismo origen, cookie de sesión, JSON. Un 401
 * lo escucha la sesión (`session.tsx`) para mandar a «Entrar».
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const BASE = '/api/dali';
const listeners = new Set<(status: number) => void>();
export const onUnauthorized = (fn: (status: number) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    if (res.status === 401) listeners.forEach((fn) => fn(401));
    const message = (data as { error?: string } | null)?.error ?? `Error ${res.status}`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
