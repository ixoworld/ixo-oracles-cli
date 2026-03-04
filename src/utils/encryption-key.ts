import { ixo } from '@ixo/impactxclient-sdk';
import base58 from 'bs58';
import { randomUUID } from 'crypto';
import { exportJWK, generateKeyPair, type JWK } from 'jose';

import { encrypt } from './account/utils';

// Matrix event type constants — must match boilerplate exactly
const STATE_EVENT_TYPE = 'ixo.room.encryption_key.index';
const STATE_KEY = 'p256_encryption';
const TIMELINE_EVENT_TYPE = 'ixo.room.encryption_key';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EncryptionKeyEntry {
  eventId: string;
  didVerificationMethodId: string;
  algorithm: string;
  curve: string;
  createdAt: string;
  active: boolean;
  publicKeyMultibase: string;
}

interface EncryptionKeyIndexContent {
  keys: Record<string, EncryptionKeyEntry>;
}

export interface EncryptionKeySetupResult {
  publicKeyMultibase: string;
  verificationMethodId: string;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function jwkToCompressedP256(jwk: JWK): Uint8Array {
  const x = Buffer.from(jwk.x!, 'base64url');
  const y = Buffer.from(jwk.y!, 'base64url');
  const compressed = new Uint8Array(33);
  // Prefix 0x02 for even y, 0x03 for odd y
  compressed[0] = (y[y.length - 1]! & 1) === 0 ? 0x02 : 0x03;
  compressed.set(x, 1);
  return compressed;
}

function p256ToMultibase(compressed: Uint8Array): string {
  // Multicodec prefix for P-256 public key: 0x1200, varint-encoded as [0x80, 0x24]
  const prefixed = new Uint8Array(2 + compressed.length);
  prefixed[0] = 0x80;
  prefixed[1] = 0x24;
  prefixed.set(compressed, 2);
  return 'z' + base58.encode(prefixed);
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

async function readEncryptionKeyIndex(
  roomId: string,
  accessToken: string,
  homeServerUrl: string,
): Promise<EncryptionKeyIndexContent | null> {
  const response = await fetch(
    `${homeServerUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${STATE_EVENT_TYPE}/${STATE_KEY}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Failed to read encryption key index (status ${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as EncryptionKeyIndexContent;
}

async function sendTimelineEvent(
  roomId: string,
  accessToken: string,
  homeServerUrl: string,
  encryptedPrivateKey: string,
): Promise<string> {
  const txnId = `enc_key_${randomUUID()}`;
  const response = await fetch(
    `${homeServerUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${TIMELINE_EVENT_TYPE}/${txnId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encrypted_private_key: encryptedPrivateKey }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to store encryption key timeline event: ${response.statusText}`,
    );
  }
  const data = (await response.json()) as { event_id: string };
  if (!data?.event_id) {
    throw new Error('No event_id returned from timeline event send');
  }
  return data.event_id;
}

async function writeStateIndex(
  roomId: string,
  accessToken: string,
  homeServerUrl: string,
  content: EncryptionKeyIndexContent,
): Promise<void> {
  const response = await fetch(
    `${homeServerUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${STATE_EVENT_TYPE}/${STATE_KEY}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to write encryption key state index: ${response.statusText}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive homeserver URL from a Matrix room ID.
 * Room ID format: !opaque:server.domain → https://server.domain
 */
export function deriveHomeServerUrl(roomId: string): string {
  const colonIdx = roomId.indexOf(':');
  if (colonIdx === -1 || !roomId.startsWith('!')) {
    throw new Error(
      `Invalid Matrix room ID format: ${roomId}. Expected !roomId:server (e.g. !abc123:devmx.ixo.earth)`,
    );
  }
  return `https://${roomId.slice(colonIdx + 1)}`;
}

/**
 * Check if an active encryption key already exists for an oracle.
 */
export async function encryptionKeyExists(
  roomId: string,
  accessToken: string,
  homeServerUrl: string,
): Promise<boolean> {
  const index = await readEncryptionKeyIndex(roomId, accessToken, homeServerUrl);
  if (!index?.keys) return false;
  return Object.values(index.keys).some((entry) => entry.active);
}

/**
 * Prepare an encryption key: either reuse an existing inactive key from Matrix,
 * or generate a new one. The key is stored in Matrix with active:false.
 * Call activateEncryptionKey() after the on-chain transaction confirms.
 */
export async function prepareEncryptionKey(params: {
  roomId: string;
  accessToken: string;
  homeServerUrl: string;
  pin: string;
  oracleEntityDid: string;
}): Promise<EncryptionKeySetupResult> {
  const { roomId, accessToken, homeServerUrl, pin, oracleEntityDid } = params;

  // Read existing index
  const existingIndex = await readEncryptionKeyIndex(roomId, accessToken, homeServerUrl);

  if (existingIndex?.keys) {
    // Reuse existing inactive key if one exists (from a previous failed attempt)
    const inactiveEntry = Object.entries(existingIndex.keys).find(
      ([, entry]) => !entry.active && entry.publicKeyMultibase,
    );
    if (inactiveEntry) {
      const [, entry] = inactiveEntry;
      return {
        publicKeyMultibase: entry.publicKeyMultibase,
        verificationMethodId: entry.didVerificationMethodId,
      };
    }
  }

  // Generate new P-256 ECDH-ES keypair
  const uuid = randomUUID();
  const { privateKey, publicKey } = await generateKeyPair('ECDH-ES', {
    crv: 'P-256',
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  privateJwk.alg = 'ECDH-ES+A256KW';
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'ECDH-ES+A256KW';

  // PIN-encrypt the private key and store as Matrix timeline event
  const encryptedPrivateKey = encrypt(JSON.stringify(privateJwk), pin);
  const timelineEventId = await sendTimelineEvent(
    roomId,
    accessToken,
    homeServerUrl,
    encryptedPrivateKey,
  );

  // Encode public key as compressed multibase per Multikey spec
  const compressedKey = jwkToCompressedP256(publicJwk);
  const multibaseEncoded = p256ToMultibase(compressedKey);

  const vmId = `${oracleEntityDid}#p256-enc-1`;

  // Write state index with active:false, merging with any existing entries
  const newEntry: EncryptionKeyEntry = {
    eventId: timelineEventId,
    didVerificationMethodId: vmId,
    algorithm: 'ECDH-ES+A256KW',
    curve: 'P-256',
    createdAt: new Date().toISOString(),
    active: false,
    publicKeyMultibase: multibaseEncoded,
  };
  const mergedIndex: EncryptionKeyIndexContent = {
    keys: {
      ...(existingIndex?.keys ?? {}),
      [uuid]: newEntry,
    },
  };
  await writeStateIndex(roomId, accessToken, homeServerUrl, mergedIndex);

  return {
    publicKeyMultibase: multibaseEncoded,
    verificationMethodId: vmId,
  };
}

/**
 * Mark the encryption key as active in the Matrix state index.
 * Call this after the on-chain MsgAddVerification transaction confirms.
 */
export async function activateEncryptionKey(params: {
  roomId: string;
  accessToken: string;
  homeServerUrl: string;
  verificationMethodId: string;
}): Promise<void> {
  const { roomId, accessToken, homeServerUrl, verificationMethodId } = params;

  const index = await readEncryptionKeyIndex(roomId, accessToken, homeServerUrl);
  if (!index?.keys) {
    throw new Error('No encryption key index found — cannot activate');
  }

  let found = false;
  for (const entry of Object.values(index.keys)) {
    if (entry.didVerificationMethodId === verificationMethodId) {
      entry.active = true;
      found = true;
    }
  }

  if (!found) {
    throw new Error(
      `No key entry found for verification method ${verificationMethodId}`,
    );
  }

  await writeStateIndex(roomId, accessToken, homeServerUrl, index);
}

/**
 * Build the MsgAddVerification message for adding the P-256 keyAgreement
 * verification method to the entity DID.
 */
export function buildAddKeyAgreementMsg(params: {
  oracleEntityDid: string;
  verificationMethodId: string;
  publicKeyMultibase: string;
  signerAddress: string;
}) {
  return {
    typeUrl: '/ixo.iid.v1beta1.MsgAddVerification',
    value: ixo.iid.v1beta1.MsgAddVerification.fromPartial({
      id: params.oracleEntityDid,
      verification: ixo.iid.v1beta1.Verification.fromPartial({
        relationships: ['keyAgreement'],
        method: ixo.iid.v1beta1.VerificationMethod.fromPartial({
          id: params.verificationMethodId,
          type: 'Multikey',
          controller: params.oracleEntityDid,
          publicKeyMultibase: params.publicKeyMultibase,
        }),
      }),
      signer: params.signerAddress,
    }),
  };
}
