/**
 * Sets up the Matrix room between the user and oracle before session creation.
 * This mirrors the contracting logic from the client SDK's useContractOracle hook,
 * but only the Matrix room creation part (no signing/authz).
 */

import { log } from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { MatrixHomeServerUrl, MatrixRoomBotServerUrl } from './common';

interface MatrixRoomSetupParams {
  userDid: string;
  oracleEntityDid: string;
  matrixAccessToken: string;
  network: NETWORK;
}

async function jsonPost<T>(url: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // Handle "already joined" as success (Matrix idempotency)
    if (res.status === 403 || text.includes('already in the room') || text.includes('already joined')) {
      return {} as T;
    }
    throw new Error(`Request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

/**
 * Ensures the Matrix room between user and oracle exists.
 * Steps:
 * 1. Source the user's main space (creates if needed)
 * 2. Join main space + sub-spaces
 * 3. Create and join the oracle room
 */
export async function ensureMatrixRoom({ userDid, oracleEntityDid, matrixAccessToken, network }: MatrixRoomSetupParams): Promise<void> {
  const roomsBotUrl = MatrixRoomBotServerUrl[network];
  const homeserverUrl = MatrixHomeServerUrl[network];

  if (!roomsBotUrl || !homeserverUrl) {
    throw new Error(`Unknown network: ${network}`);
  }

  const authHeaders = {
    Authorization: `Bearer ${matrixAccessToken}`,
  };

  log.info(`User DID: ${userDid}`);
  log.info(`Oracle Entity DID: ${oracleEntityDid}`);

  // 1. Source main space
  log.step('Sourcing Matrix space...');
  const spaceResponse = await jsonPost<{
    space_id: string;
    subspaces: Record<string, { space_id?: string }>;
  }>(`${roomsBotUrl}/spaces/source`, { did: userDid });

  const subSpaceIds = Object.values(spaceResponse.subspaces ?? {})
    .map((s) => s.space_id)
    .filter(Boolean) as string[];

  // 2. Join main space first (required before sub-spaces)
  log.step('Joining main space...');
  await jsonPost<{ room_id: string }>(`${homeserverUrl}/_matrix/client/v3/join/${spaceResponse.space_id}`, {}, authHeaders);

  // 3. Join sub-spaces (can be parallel, main space membership is required)
  if (subSpaceIds.length > 0) {
    log.step(`Joining ${subSpaceIds.length} sub-space(s)...`);
    await Promise.all(
      subSpaceIds.map((roomId) =>
        jsonPost<{ room_id: string }>(`${homeserverUrl}/_matrix/client/v3/join/${roomId}`, {}, authHeaders),
      ),
    );
  }

  // 4. Create and join oracle room
  log.step('Creating oracle room...');
  const oracleRoomResponse = await jsonPost<{ roomId: string }>(
    `${roomsBotUrl}/spaces/oracle/create`,
    { did: userDid, oracleDid: oracleEntityDid },
    authHeaders,
  );

  // 5. Join the oracle room
  log.step(`Joining oracle room: ${oracleRoomResponse.roomId}`);
  await jsonPost<{ room_id: string }>(`${homeserverUrl}/_matrix/client/v3/join/${oracleRoomResponse.roomId}`, {}, authHeaders);

  log.success('Matrix room ready');
}
