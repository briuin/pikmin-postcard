type ErrorPayload = {
  error?: unknown;
};

export function getErrorMessageFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = (payload as ErrorPayload).error;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}

export async function parseJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function parseJsonResponseOrThrow<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const payload = await parseJsonPayload(response);
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload) ?? fallbackMessage);
  }

  return payload as T;
}
