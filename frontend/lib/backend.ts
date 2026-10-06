import "server-only";
import { fetchBackend } from "./observability";
export class BackendError extends Error {
  constructor(readonly status: number) {
    super(`Backend returned ${status}`);
    this.name = "BackendError";
  }
}
export async function backend<T>(path: string): Promise<T> {
  const res = await fetchBackend(path);
  if (!res.ok) throw new BackendError(res.status);
  return res.json();
}
