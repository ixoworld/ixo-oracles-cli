import { CID } from 'multiformats';
import { base64 } from 'multiformats/bases/base64';
import * as mfsha2 from 'multiformats/hashes/sha2';

export async function createCIDFromBase64(base64String: string): Promise<string> {
  // Add 'm' prefix if not present
  const multibaseString = base64String.startsWith('m') ? base64String : 'm' + base64String;

  // Decode base64 to bytes
  const bytes = base64.decode(multibaseString);

  // Create SHA-256 hash of the bytes
  const hash = await mfsha2.sha256.digest(bytes);

  // Create CID (using SHA-256 and RAW codec)
  const cid = CID.create(1, 0x55, hash);

  return cid.toString();
}

export function jsonToBase64(jsonString: string): string {
  const uint8Array = new TextEncoder().encode(jsonString);
  return btoa(String.fromCharCode(...Array.from(uint8Array)));
}
