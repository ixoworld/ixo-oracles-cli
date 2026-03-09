export interface OpenIdToken {
  access_token: string;
  token_type: string;
  matrix_server_name: string;
  expires_in: number;
}

export interface SessionResult {
  sessionId: string;
  roomId: string;
}

const API_TIMEOUT = 30_000;

/**
 * Requests an OpenID token from the Matrix homeserver.
 */
export async function getOpenIdToken(
  homeserverUrl: string,
  userId: string,
  accessToken: string,
): Promise<OpenIdToken> {
  const encodedUserId = encodeURIComponent(userId);
  const url = `${homeserverUrl}/_matrix/client/v3/user/${encodedUserId}/openid/request_token`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get OpenID token (${res.status}): ${body}`);
  }

  return (await res.json()) as OpenIdToken;
}

/**
 * Creates a chat session with the oracle API.
 */
export async function createSession(baseUrl: string, openIdToken: string): Promise<SessionResult> {
  const res = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-matrix-access-token': openIdToken,
    },
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create session (${res.status}): ${body}`);
  }

  return (await res.json()) as SessionResult;
}

/**
 * Deletes a chat session.
 */
export async function deleteSession(baseUrl: string, sessionId: string, openIdToken: string): Promise<void> {
  await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: {
      'x-matrix-access-token': openIdToken,
    },
    signal: AbortSignal.timeout(API_TIMEOUT),
  });
}

/**
 * Sends a streaming message to the oracle and returns the response body stream.
 */
export async function sendStreamingMessage(
  baseUrl: string,
  sessionId: string,
  message: string,
  openIdToken: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-matrix-access-token': openIdToken,
    },
    body: JSON.stringify({ message, stream: true }),
  };
  if (signal) {
    fetchOptions.signal = signal;
  }
  const res = await fetch(`${baseUrl}/messages/${encodeURIComponent(sessionId)}`, fetchOptions);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send message (${res.status}): ${body}`);
  }

  if (!res.body) {
    throw new Error('Response body is empty');
  }

  return res.body;
}

/**
 * Checks if the oracle API is healthy.
 */
export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
