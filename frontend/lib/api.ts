export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : response.status === 422
          ? "Check the form fields and try again."
          : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
