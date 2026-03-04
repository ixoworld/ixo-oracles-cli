import * as p from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { Command } from '.';
import { CLIResult } from '../types';
import {
  checkIsEntityDid,
  checkRequiredPin,
  checkRequiredString,
  selectNetwork,
} from '../utils/common';
import {
  activateEncryptionKey,
  buildAddKeyAgreementMsg,
  deriveHomeServerUrl,
  encryptionKeyExists,
  prepareEncryptionKey,
} from '../utils/encryption-key';
import { RuntimeConfig } from '../utils/runtime-config';
import { Wallet } from '../utils/wallet';

export class SetupEncryptionKeyCommand implements Command {
  name = 'setup-encryption-key';
  description = 'Setup P-256 encryption key for an existing oracle (keyAgreement)';

  constructor(
    private wallet: Wallet,
    private config: RuntimeConfig,
  ) {}

  async execute(): Promise<CLIResult> {
    const network = this.config.getValue('network') as NETWORK;
    if (!network) {
      await selectNetwork(this.config);
    }

    const results = await p.group(
      {
        entityDid: () =>
          p.text({
            message: 'Oracle entity DID (ORACLE_ENTITY_DID from .env):',
            initialValue:
              this.config.getValue('entityDid')?.toString() ?? '',
            validate(value) {
              return checkIsEntityDid(value);
            },
          }),
        matrixRoomId: () =>
          p.text({
            message:
              'Oracle Matrix room ID (MATRIX_ACCOUNT_ROOM_ID from .env):',
            placeholder: '!abc123:devmx.ixo.earth',
            validate(value) {
              if (!value || !value.startsWith('!') || !value.includes(':')) {
                return 'Matrix room ID must be in format !roomId:server (e.g. !abc123:devmx.ixo.earth)';
              }
              return checkRequiredString(value, 'Matrix room ID is required');
            },
          }),
        matrixAccessToken: () =>
          p.password({
            message:
              'Oracle Matrix access token (MATRIX_ORACLE_ADMIN_ACCESS_TOKEN from .env):',
            validate(value) {
              return checkRequiredString(
                value,
                'Matrix access token is required',
              );
            },
          }),
        pin: () =>
          p.password({
            message: 'Oracle PIN (MATRIX_VALUE_PIN from .env):',
            validate(value) {
              return checkRequiredPin(value);
            },
          }),
      },
      {
        onCancel: () => {
          p.cancel('Operation cancelled.');
          process.exit(0);
        },
      },
    );

    // Derive homeserver URL from room ID
    const homeServerUrl = deriveHomeServerUrl(results.matrixRoomId);

    try {
      if (!this.wallet.signXClient || !this.wallet.wallet?.address) {
        throw new Error(
          'Wallet/SignX client not available. Please login first.',
        );
      }

      // 1. Check if key already exists and is active
      p.log.info('Checking for existing encryption key...');
      const keyAlreadyExists = await encryptionKeyExists(
        results.matrixRoomId,
        results.matrixAccessToken,
        homeServerUrl,
      );

      if (keyAlreadyExists) {
        p.log.info(
          'Encryption key already exists for this oracle. No action needed.',
        );
        return {
          success: true,
          data: 'Encryption key already exists',
        };
      }

      // 2. Prepare keypair (generates new or reuses existing inactive key)
      p.log.info('Preparing P-256 encryption keypair...');
      const encKeyResult = await prepareEncryptionKey({
        roomId: results.matrixRoomId,
        accessToken: results.matrixAccessToken,
        homeServerUrl,
        pin: results.pin,
        oracleEntityDid: results.entityDid,
      });
      p.log.success('Encryption key prepared in Matrix room');

      // 3. Build and sign MsgAddVerification via SignX
      const addKeyMsg = buildAddKeyAgreementMsg({
        oracleEntityDid: results.entityDid,
        verificationMethodId: encKeyResult.verificationMethodId,
        publicKeyMultibase: encKeyResult.publicKeyMultibase,
        signerAddress: this.wallet.wallet.address,
      });

      p.log.info(
        'Sign to add P-256 encryption key (keyAgreement) to the entity',
      );
      const tx = await this.wallet.signXClient.transact(
        [addKeyMsg],
        this.wallet.wallet,
      );
      this.wallet.signXClient.displayTransactionQRCode(JSON.stringify(tx));
      await this.wallet.signXClient.pollNextTransaction();
      await this.wallet.signXClient.awaitTransaction();

      // 4. Mark key as active only after chain confirmation
      await activateEncryptionKey({
        roomId: results.matrixRoomId,
        accessToken: results.matrixAccessToken,
        homeServerUrl,
        verificationMethodId: encKeyResult.verificationMethodId,
      });

      p.log.success(
        `P-256 encryption key published to entity DID: ${results.entityDid}`,
      );
      p.log.info(
        `Verification method ID: ${encKeyResult.verificationMethodId}`,
      );

      return {
        success: true,
        data: `Encryption key setup complete for ${results.entityDid}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
