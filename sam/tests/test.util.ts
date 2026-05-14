export const BASE_URL =
  process.env.SAM_LOCAL_API_URL ?? 'http://localhost:3000';

export const appService = 'app';
export const appId = '8538bc99-3596-4eb3-8101-263e70519315';
export const dvlaService = 'dvla';
export const dvlaServiceId = '6ed49c2f-2688-4d23-adde-473f32ebe466';

export async function makeRequest(options: {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown> | undefined;
  timeoutMs?: number;
  headers?: Record<string, unknown> | undefined;
}) {
  const {
    url,
    method = 'GET',
    body,
    timeoutMs = 15_000,
    headers = {},
  } = options;
  return fetch(`${BASE_URL}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function reachable(url: string) {
  try {
    await makeRequest({ url });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export function makeOversizedPayload(
  size: number = 400,
): Record<string, string> {
  return { filler: 'x'.repeat(size * 1024) };
}
