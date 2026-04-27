const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 512;

export class ApiError extends Error {
  status: number;
  path: string;
  constructor(path: string, status: number, body: string) {
    super(`${path} -> ${status} | ${body.slice(0, MAX_ERROR_BODY_LENGTH)}`);
    this.name = "ApiError";
    this.path = path;
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(path, response.status, body);
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export { API_BASE_URL };
