import { utils } from '@ixo/impactxclient-sdk';
import { createMatrixApiClient } from '@ixo/matrixclient-sdk';

import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { MatrixHomeServerUrl, MatrixRoomBotServerUrl } from '../common';
import {
  checkIsUsernameAvailable,
  createMatrixClient,
  generatePassphraseFromMnemonic,
  generatePasswordFromMnemonic,
  generateUsernameFromAddress,
  generateUserRoomAliasFromAddress,
  hasCrossSigningAccountData,
  logoutMatrixClient,
  mxRegisterWithSecp,
  setupCrossSigning,
} from './matrix';
import { checkIidDocumentExists, createIidDocument, delay, encrypt, getSecpClient } from './utils';

export interface SimplifiedRegistrationResult {
  address: string;
  did: string;
  mnemonic: string;
  matrixUserId: string;
  matrixRoomId: string;
  matrixMnemonic: string;
  matrixPassword: string;
  matrixAccessToken: string;
  matrixRecoveryPhrase: string;
  pin: string;
  matrixDeviceName: string;
}

const DEVICE_NAME = 'Oracles CLI';
/**
 * Simplified user registration flow without email verification or passkey authentication
 * Includes: wallet creation, DID creation, Matrix account with secp auth, Matrix room setup, encrypted mnemonic storage
 * @param pin - User PIN for encrypting Matrix mnemonic
 * @returns Registration result with wallet and Matrix account details
 */
export async function registerUserSimplified(
  {
    pin,
    oracleName,
    network,
    oracleAvatarUrl,
  }: {
    pin: string;
    oracleName: string;
    network: NETWORK;
    oracleAvatarUrl: string;
  },
  transferTokens: (address: string) => Promise<void>
): Promise<SimplifiedRegistrationResult> {
  try {
    // =================================================================================================
    // 1. CREATE WALLET
    // =================================================================================================
    const mnemonic = utils.mnemonic.generateMnemonic();
    const wallet = await getSecpClient(mnemonic);
    const address = wallet.baseAccount.address;
    console.log('✅ Wallet created:', address);

    //  transfer tokens
    await transferTokens(address);

    // =================================================================================================
    // 2. DID CREATION
    // =================================================================================================
    const did = utils.did.generateSecpDid(address);
    const didExists = await checkIidDocumentExists(did, network);
    console.log('✅ DID exists:', didExists);
    if (!didExists) {
      console.log('✅ DID does not exist, creating...');
      await createIidDocument(did, network, wallet);
      console.log('✅ DID created, waiting 500ms...');
      await delay(500);
      console.log('✅ Checking if DID exists...');
      const didExistsAfterCreation = await checkIidDocumentExists(did, network);
      if (!didExistsAfterCreation) {
        throw new Error('Failed to create DID document');
      }
    }
    console.log('✅ DID created:', did);

    // =================================================================================================
    // 3. MATRIX ACCOUNT CREATION
    // =================================================================================================
    const mxMnemonic = utils.mnemonic.generateMnemonic(12);
    const homeServerUrl = MatrixHomeServerUrl[network];
    const mxUsername = generateUsernameFromAddress(address);
    const mxPassword = generatePasswordFromMnemonic(mxMnemonic);
    const mxPassphrase = generatePassphraseFromMnemonic(mxMnemonic);

    // Check if username is available
    const isUsernameAvailable = await checkIsUsernameAvailable({
      homeServerUrl: homeServerUrl,
      username: mxUsername,
    });
    if (!isUsernameAvailable) {
      throw new Error('Matrix account already exists');
    }

    // Clear any residual matrix data
    // await logoutMatrixClient({ baseUrl: homeServerUrl, accessToken: '', userId: '', deviceId: '' });

    // Register using secp256k1 signature (not passkey)
    const account = await mxRegisterWithSecp(address, mxPassword, DEVICE_NAME, wallet, network);
    if (!account?.accessToken) {
      throw new Error('Failed to register matrix account');
    }
    console.log('✅ Matrix account created:', account.userId);

    // =================================================================================================
    // 4. MATRIX CLIENT SETUP
    // =================================================================================================
    const mxClient = await createMatrixClient({
      homeServerUrl,
      accessToken: account.accessToken,
      userId: account.userId,
      deviceId: account.deviceId,
    });

    try {
      await Promise.all([mxClient.setDisplayName(oracleName), mxClient.setAvatarUrl(oracleAvatarUrl)]);
    } catch (error) {
      console.error('Failed to set display name or avatar url:', error);
    }

    const matrixApiClient = createMatrixApiClient({
      homeServerUrl: homeServerUrl,
      accessToken: account.accessToken,
    });

    // Setup cross signing
    let hasCrossSigning = hasCrossSigningAccountData(mxClient);
    if (!hasCrossSigning) {
      hasCrossSigning = await setupCrossSigning(mxClient, {
        securityPhrase: mxPassphrase,
        password: mxPassword,
        forceReset: true,
      });
      if (!hasCrossSigning) {
        throw new Error('Failed to setup cross signing');
      }
    }
    console.log('✅ Matrix cross-signing setup completed');

    // =================================================================================================
    // 5. MATRIX ROOM CREATION/JOIN
    // =================================================================================================
    const mxRoomAlias = generateUserRoomAliasFromAddress(address, account.baseUrl);
    const queryIdResponse = await matrixApiClient.room.v1beta1.queryId(mxRoomAlias).catch(() => undefined);
    let roomId: string = queryIdResponse?.room_id ?? '';

    if (!roomId) {
      // Create room via bot
      const response = await fetch(`${MatrixRoomBotServerUrl[network]}/room/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          did: did,
          userMatrixId: account.userId,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create matrix room');
      }
      const data = (await response.json()) as { roomId: string };
      roomId = data.roomId;
      if (!roomId) {
        throw new Error('Failed to create user matrix room');
      }
    }

    // Ensure room is joined
    let joinedMembers = await matrixApiClient.room.v1beta1.listJoinedMembers(roomId).catch(() => undefined);
    let joined = !!joinedMembers?.joined?.[account.userId];
    if (!joined) {
      const joinResponse = await matrixApiClient.room.v1beta1.join(roomId);
      if (!joinResponse.room_id) {
        throw new Error('Failed to join matrix room');
      }
      joinedMembers = await matrixApiClient.room.v1beta1.listJoinedMembers(roomId);
      joined = !!joinedMembers?.joined?.[account.userId];
      if (!joined) {
        throw new Error('Failed to join matrix room');
      }
    }
    console.log('✅ Matrix room created/joined:', roomId);

    // =================================================================================================
    // 6. ENCRYPT AND STORE MATRIX MNEMONIC
    // =================================================================================================
    const encryptedMnemonic = encrypt(mxMnemonic, pin);
    const storeEncryptedMnemonicResponse = await fetch(
      `${homeServerUrl}/_matrix/client/r0/rooms/${roomId}/state/ixo.room.state.secure/encrypted_mnemonic`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${account.accessToken as string}`,
        },
        body: JSON.stringify({
          encrypted_mnemonic: encryptedMnemonic,
        }),
      }
    );
    if (!storeEncryptedMnemonicResponse.ok) {
      throw new Error('Failed to store encrypted mnemonic in matrix room');
    }
    await storeEncryptedMnemonicResponse.json();
    console.log('✅ Encrypted Matrix mnemonic stored in room');

    // =================================================================================================
    // 7. LOGOUT MATRIX CLIENT
    // =================================================================================================
    await logoutMatrixClient({
      mxClient,
      baseUrl: homeServerUrl,
      accessToken: account.accessToken,
      userId: account.userId,
      deviceId: account.deviceId,
    });

    // =================================================================================================
    // 7. RETURN REGISTRATION RESULT
    // =================================================================================================
    return {
      address: address,
      did: did,
      mnemonic: mnemonic, // Wallet mnemonic - store securely!
      matrixUserId: account.userId,
      matrixRoomId: roomId,
      matrixMnemonic: mxMnemonic, // Matrix mnemonic - also store securely!
      matrixPassword: mxPassword,
      matrixAccessToken: account.accessToken,
      matrixRecoveryPhrase: mxMnemonic,
      pin: pin,
      matrixDeviceName: DEVICE_NAME,
    };
  } catch (error) {
    console.error('Simplified registration failed:', error);
    throw error;
  }
}
