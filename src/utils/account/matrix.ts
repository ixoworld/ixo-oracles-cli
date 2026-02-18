import { sha256 } from '@cosmjs/crypto';
import { encrypt as eciesEncrypt } from 'eciesjs';
import { ClientEvent, createClient, MatrixClient } from 'matrix-js-sdk';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import md5 from 'md5';

// import cons from '@constants/matrix';
// import { isAuthenticated, secret } from '@utils/secrets';
import { cacheSecretStorageKey, clearSecretStorageKeys, getSecretStorageKey } from './secretStorageKeys';
import { delay } from './utils';

const WELL_KNOWN_URI = '/.well-known/matrix/client';

// =================================================================================================
// AUTH
// =================================================================================================
interface AuthResponse {
  accessToken: string;
  deviceId: string;
  userId: string;
  baseUrl: string;
}
export const mxLogin = async (
  {
    homeServerUrl,
    username,
    password,
    deviceName,
  }: { homeServerUrl: string; username: string; password: string; deviceName: string },
  localMatrix = false
) => {
  let mxHomeServerUrl = homeServerUrl;
  let mxUsername = username;
  const mxIdMatch = mxUsername.match(/^@(.+):(.+\..+)$/);
  if (mxIdMatch) {
    mxUsername = mxIdMatch[1] as string;
    mxHomeServerUrl = mxIdMatch[2] as string;
    mxHomeServerUrl = localMatrix ? mxHomeServerUrl : await getBaseUrl(mxHomeServerUrl);
  }

  try {
    const client = createTemporaryClient(mxHomeServerUrl);
    const response = await client.login('m.login.password', {
      identifier: {
        type: 'm.id.user',
        user: normalizeUsername(mxUsername),
      },
      password,
      initial_device_display_name: deviceName,
    });
    const data: AuthResponse = {
      accessToken: response.access_token,
      deviceId: response.device_id,
      userId: response.user_id,
      baseUrl: localMatrix ? mxHomeServerUrl : response?.well_known?.['m.homeserver']?.base_url || client.baseUrl,
    };
    return data;
  } catch (error) {
    let msg = (error as any).message;
    if (msg === 'Unknown message') {
      msg = 'Please check your credentials';
    }
    console.error(`mxLogin::`, msg);
    throw new Error(msg);
  }
};

// =================================================================================================
// NEW API-BASED REGISTRATION
// =================================================================================================

interface PublicKeyResponse {
  publicKey: string;
  fingerprint: string;
  algorithm: string;
  usage: string;
}

interface UserCreationChallenge {
  timestamp: string;
  address: string;
  service: string;
  type: string;
}

interface UserCreationRequest {
  address: string;
  encryptedPassword: string;
  publicKeyFingerprint: string;
  authnResult?: any;
  secpResult?: {
    signature: string;
    challenge: string;
  };
}

interface UserCreationResponse {
  success: boolean;
  matrixUserId: string;
  address: string;
  message: string;
}

/**
 * Fetch the public key for password encryption from the user creation API
 * @returns Public key information for encryption
 */
export async function getPublicKeyForEncryption(roomBotUrl: string): Promise<PublicKeyResponse> {
  const response = await fetch(`${roomBotUrl}/public-key`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch public key for encryption');
  }

  const data = (await response.json()) as PublicKeyResponse;
  return data;
}

/**
 * Create a structured challenge for user creation
 * @param address The user's address (without did:ixo: prefix)
 * @returns The challenge object and its base64 representation
 */
export function createUserCreationChallenge(address: string): {
  challenge: UserCreationChallenge;
  challengeBase64: string;
} {
  const challenge: UserCreationChallenge = {
    timestamp: new Date().toISOString(),
    address: address,
    service: 'matrix',
    type: 'create-account',
  };

  const challengeBase64 = Buffer.from(JSON.stringify(challenge)).toString('base64');

  return { challenge, challengeBase64 };
}

/**
 * Encrypt password using ECIES with the provided public key
 * @param password The password to encrypt
 * @param publicKey The public key in hex format
 * @returns The encrypted password in hex format
 */
export function encryptPasswordWithECIES(password: string, publicKey: string): string {
  const publicKeyBytes = new Uint8Array(Buffer.from(publicKey, 'hex'));
  const passwordBytes = new Uint8Array(Buffer.from(password, 'utf8'));
  const encryptedPassword = eciesEncrypt(publicKeyBytes, passwordBytes);
  return Array.from(encryptedPassword, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create user account using secp256k1 signature authentication
 * @param address The user's address
 * @param password The matrix password
 * @param signature The secp256k1 signature (base64)
 * @param challenge The challenge that was signed (base64)
 * @returns The user creation response
 */
export async function createUserAccountWithSecp(
  address: string,
  password: string,
  signature: string,
  challenge: string,
  homeServerUrl: string,
  roomBotUrl: string
): Promise<UserCreationResponse> {
  const publicKeyInfo = await getPublicKeyForEncryption(roomBotUrl);
  const encryptedPassword = encryptPasswordWithECIES(password, publicKeyInfo.publicKey);

  const request: UserCreationRequest = {
    address,
    encryptedPassword,
    publicKeyFingerprint: publicKeyInfo.fingerprint,
    secpResult: {
      signature,
      challenge,
    },
  };

  const response = await fetch(`${roomBotUrl}/user/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let errorMessage = `Failed to create user account (HTTP ${response.status})`;
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.error || errorData.message || errorData.detail || responseText;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    console.error(`Room bot error [${response.status}]: ${responseText}`);
    throw new Error(errorMessage);
  }

  return (await response.json()) as UserCreationResponse;
}

// =================================================================================================
// UPDATED REGISTRATION FUNCTIONS
// =================================================================================================

/**
 * Register matrix account using the new API with secp256k1 signature authentication
 * @param address The user's address
 * @param password The matrix password
 * @param deviceName The device name for the Matrix session
 * @param wallet The secp wallet for signing
 * @param homeServerUrl The Matrix homeserver URL
 * @param roomBotUrl The room bot URL
 * @returns AuthResponse with access token and user details
 */
export async function mxRegisterWithSecp(
  address: string,
  password: string,
  deviceName: string,
  wallet: { sign: (message: string) => Promise<Uint8Array> },
  homeServerUrl: string,
  roomBotUrl: string
): Promise<AuthResponse> {
  try {
    // Create challenge and sign it
    const { challengeBase64 } = createUserCreationChallenge(address);
    const signatureBytes = await wallet.sign(challengeBase64);
    const signature = Buffer.from(signatureBytes).toString('base64');

    const userCreationResult = await createUserAccountWithSecp(
      address,
      password,
      signature,
      challengeBase64,
      homeServerUrl,
      roomBotUrl
    );

    if (!userCreationResult.success) {
      throw new Error('Failed to create matrix account via API');
    }

    const username = generateUsernameFromAddress(address);

    const loginResult = await mxLogin({
      homeServerUrl,
      username,
      password,
      deviceName,
    });

    return loginResult;
  } catch (error) {
    console.error('mxRegisterWithSecp error:', error);
    throw error;
  }
}

export async function checkIsUsernameAvailable({
  homeServerUrl,
  username,
}: {
  homeServerUrl: string;
  username: string;
}) {
  const client = createTemporaryClient(homeServerUrl);
  try {
    const isUsernameAvailable = await client.isUsernameAvailable(username);
    return !!isUsernameAvailable;
  } catch (error) {
    return false;
  }
}

// =================================================================================================
// CLIENT
// =================================================================================================
/**
 * Creates a temporary matrix client, used for matrix login or registration to get access tokens
 * @param homeServerUrl - the home server url to instantiate the matrix client
 * @returns matrix client
 */
export function createTemporaryClient(homeServerUrl: string) {
  if (!homeServerUrl) {
    throw new Error('Home server URL is required to instantiate matrix client');
  }
  return createClient({
    baseUrl: homeServerUrl,
  });
}

export async function createMatrixClient({
  homeServerUrl,
  accessToken,
  userId,
  deviceId,
}: {
  homeServerUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
}) {
  console.log('createMatrixClient::', { homeServerUrl, accessToken, userId, deviceId });

  if (!homeServerUrl || !accessToken || !userId || !deviceId) {
    throw new Error('Login to Matrix account before trying to instantiate Matrix client.');
  }

  // const indexedDBStore = new IndexedDBStore({
  //   indexedDB: global.indexedDB,
  //   dbName: 'matrix-sync-store',
  // });
  // const legacyCryptoStore = new IndexedDBCryptoStore()

  const mxClient = createClient({
    baseUrl: homeServerUrl,
    accessToken,
    userId,
    // store: indexedDBStore,
    // cryptoStore: legacyCryptoStore,
    deviceId,
    timelineSupport: true,
    cryptoCallbacks: {
      getSecretStorageKey: getSecretStorageKey,
      cacheSecretStorageKey: cacheSecretStorageKey,
    },
    verificationMethods: ['m.sas.v1'],
  });
  // await indexedDBStore.startup();
  await mxClient.initRustCrypto({
    useIndexedDB: false,
  });
  // mxClient.setGlobalErrorOnUnknownDevices(false);
  mxClient.setMaxListeners(20);
  // const filter = new Filter(userId);
  // filter.setDefinition({
  //   room: {
  //     state: {
  //       lazy_load_members: true,
  //       types: [],
  //     },
  //     timeline: {
  //       types: [],
  //     },
  //   },
  //   // Disable unnecessary features
  //   presence: {
  //     types: [], // No presence updates needed
  //   },
  //   account_data: {
  //     types: ['m.cross_signing.master'], // No account data needed
  //   },
  // });
  await mxClient.startClient({
    lazyLoadMembers: true,
    // initialSyncLimit: 1,
    includeArchivedRooms: false,
    // pollTimeout: 2 * 60 * 1000, // poll every 2 minutes
    // filter: filter,
  });
  await new Promise<void>((resolve, reject) => {
    const sync = {
      NULL: () => {
        console.info('[NULL] state');
      },
      SYNCING: () => {
        void 0;
      },
      PREPARED: () => {
        console.info(`[PREPARED] state: user ${userId}`);
        resolve();
      },
      RECONNECTING: () => {
        console.info('[RECONNECTING] state');
      },
      CATCHUP: () => {
        console.info('[CATCHUP] state');
      },
      ERROR: () => {
        reject(new Error('[ERROR] state: starting matrix client'));
      },
      STOPPED: () => {
        console.info('[STOPPED] state');
      },
    };
    mxClient.on(ClientEvent.Sync, (state) => {
      sync[state]();
    });
  });
  return mxClient;
}

export async function logoutMatrixClient({
  mxClient,
  baseUrl,
  accessToken,
  userId,
  deviceId,
}: {
  mxClient?: MatrixClient;
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
}) {
  let client = mxClient;
  if (!client) {
    client = createClient({
      baseUrl: baseUrl,
      accessToken,
      userId,
      deviceId,
    });
  }
  if (client) {
    client.stopClient();
    await client.logout().catch(console.error);
    client.clearStores();
  }
}

// =================================================================================================
// CROSS SIGNING
// =================================================================================================
/**
 * Check if the user has cross-signing account data.
 * @param {MatrixClient} mxClient - The matrix client to check.
 * @returns {boolean} True if the user has cross-signing account data, otherwise false.
 */
export function hasCrossSigningAccountData(mxClient: MatrixClient): boolean {
  const masterKeyData = mxClient.getAccountData('m.cross_signing.master');
  console.log('hasCrossSigningAccountData::masterKeyData', masterKeyData);
  return !!masterKeyData;
}

/**
 * Setup cross signing and secret storage for the current user
 * @param {MatrixClient} mxClient - The matrix client to setup cross signing for
 * @param {string} securityPhrase - the security phrase to use for secret storage
 * @param {string} password - the password for the matrix account
 * @param {boolean} forceReset - if to force reset the cross signing keys (NB, only do if you know what you are doing!!!)
 * @param {boolean} skipBootstrapSS - if to skip bootstrapping secret storage
 * @returns {boolean} True if the cross signing was setup successfully, otherwise false.
 */
export async function setupCrossSigning(
  mxClient: MatrixClient,
  {
    securityPhrase,
    password,
    forceReset = false,
    skipBootstrapSecureStorage = false,
  }: { securityPhrase: string; password: string; forceReset?: boolean; skipBootstrapSecureStorage?: boolean }
): Promise<boolean> {
  if (forceReset) {
    clearSecretStorageKeys();
  }

  const mxCrypto = mxClient.getCrypto() as CryptoApi;
  if (!mxCrypto) {
    throw new Error('Failed to setup matrix cross signing - failed to get matrix crypto api');
  }
  if (!skipBootstrapSecureStorage) {
    const recoveryKey = await mxCrypto.createRecoveryKeyFromPassphrase(securityPhrase);
    clearSecretStorageKeys();
    await mxCrypto.bootstrapSecretStorage({
      createSecretStorageKey: async () => recoveryKey!,
      setupNewSecretStorage: forceReset,
    });
  }
  const userId = mxClient.getUserId()!;
  await mxCrypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: async function (makeRequest) {
      await makeRequest(getAuthId({ userId, password }));
    },
    setupNewCrossSigning: forceReset,
  });
  await mxCrypto.resetKeyBackup();

  await delay(300);

  return !!mxClient.getAccountData('m.cross_signing.master');
}

// =================================================================================================
// GENERAL
// =================================================================================================
/**
 * Generates a username from an address, used for matrix login, generated an account did
 * @param {string} address - the address to generate the username from
 * @returns {string} username
 */
export function generateUsernameFromAddress(address: string): string {
  if (!address) {
    throw new Error('Address is required to generate matrix username');
  }
  return 'did-ixo-' + address;
}

/**
 * Generates a password from a mnemonic, used for matrix login, generated using the first 24 bytes of the base64 encoded md5 hash of the mnemonic
 * @param {string} mnemonic - the mnemonic to generate the password from
 * @returns {string} password
 */
export function generatePasswordFromMnemonic(mnemonic: string): string {
  const base64 = Buffer.from(md5(mnemonic.replace(/ /g, ''))).toString('base64');
  return base64.slice(0, 24);
}

/**
 * Generates a recovery phrase from a mnemonic, used for matrix recovery, generated using the first 32 bytes of the base64 encoded sha256 hash of the mnemonic
 * @param {string} mnemonic - the mnemonic to generate the recovery phrase from
 * @returns {string} recoveryPhrase
 */
export function generateRecoveryPhraseFromMnemonic(mnemonic: string): string {
  const hash = sha256(new TextEncoder().encode(mnemonic.replace(/ /g, '')));
  const base64 = Buffer.from(hash).toString('base64');
  return base64.slice(0, 32);
}

/**
 * Extracts the home server URL from a user ID.
 * @param {string} userId - The user ID to extract the homeserver URL from.
 * @returns {string} The homeserver URL.
 */
export function extractHomeServerUrlFromUserId(userId: string): string {
  const parts = userId.split(':');
  if (parts.length < 2) {
    throw new Error('Invalid userId');
  }
  return parts.slice(1).join(':');
}

/**
 * Generates a recovery phrase from a mnemonic, used for matrix recovery, generated using the first 32 bytes of the base64 encoded sha256 hash of the mnemonic
 * @param {string} mnemonic - the mnemonic to generate the recovery phrase from
 * @returns {string} passphrase
 */
export function generatePassphraseFromMnemonic(mnemonic: string): string {
  const hash = sha256(new TextEncoder().encode(mnemonic.replace(/ /g, '')));
  const base64 = Buffer.from(hash).toString('base64');
  return base64.slice(0, 32);
}

/**
 * Cleans a home server URL by removing protocol and trailing slashes
 * @param {string} homeServer - the homeserver URL to clean
 * @returns {string} cleaned homeserver URL
 */
export function cleanMatrixHomeServerUrl(homeServer: string): string {
  return homeServer.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
}

/**
 * Generates a room name from an account address, used for matrix user room where user can manage their own data
 * @param {string} address - the address of the user
 * @param {string} postpend - the postpend of the room name (for testing)
 * @returns {string} roomName
 */
export function generateUserRoomNameFromAddress(address: string, postpend = ''): string {
  return 'did-ixo-' + address + postpend;
}

/**
 * Generates a room alias from an account address, used for matrix user room where user can manage their own data
 * @param {string} address - the address of the user
 * @param {string} postpend - the postpend of the room alias (for testing)
 * @returns {string} roomAlias
 */
export function generateUserRoomAliasFromAddress(address: string, homeServerUrl: string): string {
  return '#' + generateUserRoomNameFromAddress(address) + ':' + cleanMatrixHomeServerUrl(homeServerUrl);
}

/**
 * Get the base URL for a given servername.
 * @param servername The servername to get the base URL for.
 * @returns The base URL for the servername.
 */
export async function getBaseUrl(servername: string): Promise<string> {
  let protocol = 'https://';
  if (/^https?:\/\//.test(servername)) {
    protocol = '';
  }
  const serverDiscoveryUrl = `${protocol}${servername}${WELL_KNOWN_URI}`;
  try {
    const response = await fetch(serverDiscoveryUrl, { method: 'GET' });
    const result = await response.json();
    const baseUrl = (result as { 'm.homeserver': { base_url: string } })['m.homeserver']?.base_url;
    if (baseUrl === undefined) {
      throw new Error();
    }
    return baseUrl;
  } catch (e) {
    return `${protocol}${servername}`;
  }
}

/**
 * Normalize a username by removing leading '@' and trimming whitespace.
 * @param {string} rawUsername - The raw username to normalize.
 * @returns {string} The normalized username.
 */
export function normalizeUsername(rawUsername: string): string {
  const noLeadingAt = rawUsername.indexOf('@') === 0 ? rawUsername.substring(1) : rawUsername;
  return noLeadingAt.trim();
}

/**
 * Generates the authentication identifier for matrix login
 * @param {string} password - the password for the matrix account
 * @returns {object} authId - the authentication identifier
 */
export function getAuthId({ userId, password }: { userId: string; password: string }): {
  type: string;
  password: string;
  identifier: { type: string; user: string };
} {
  return {
    type: 'm.login.password',
    password,
    identifier: {
      type: 'm.id.user',
      user: userId,
    },
  };
}
