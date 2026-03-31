import * as p from '@clack/prompts';
import { Command } from '.';
import { CLIResult } from '../types';
import { MatrixHomeServerUrl, selectNetwork } from '../utils/common';
import { getSecpClient } from '../utils/account/utils';
import { generateUsernameFromAddress, mxLoginRaw } from '../utils/account/matrix';
import { RuntimeConfig } from '../utils/runtime-config';
import { Wallet } from '../utils/wallet';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';

export class OfflineLoginCommand implements Command {
  name = 'offline-login';
  description = 'Login with a local mnemonic (offline wallet)';

  constructor(private wallet: Wallet, private config: RuntimeConfig) {}

  async execute(): Promise<CLIResult> {
    try {
      const network = await selectNetwork(this.config);

      const results = await p.group(
        {
          mnemonic: () =>
            p.password({
              message: 'Enter your mnemonic phrase:',
              validate(value) {
                if (!value || value.trim().split(/\s+/).length < 12) {
                  return 'Mnemonic must be at least 12 words';
                }
                return undefined;
              },
            }),
          name: () =>
            p.text({
              message: 'Display name for this wallet:',
              placeholder: 'My Wallet',
              validate(value) {
                if (!value?.trim()) return 'Name is required';
                return undefined;
              },
            }),
          matrixPassword: () =>
            p.password({
              message: 'Matrix password:',
              validate(value) {
                if (!value?.trim()) return 'Matrix password is required';
                return undefined;
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

      // Derive wallet from mnemonic
      const secpClient = await getSecpClient(results.mnemonic);
      const account = secpClient.baseAccount;

      // Derive Matrix username from address, password provided by user
      const username = generateUsernameFromAddress(account.address);

      // Login to Matrix
      const homeServerUrl = MatrixHomeServerUrl[network as NETWORK];
      p.log.info('Logging into Matrix...');
      const matrixLogin = await mxLoginRaw({
        homeServerUrl,
        username,
        password: results.matrixPassword,
      });

      // Build and save wallet
      this.wallet.setWallet({
        address: account.address,
        algo: 'secp',
        did: secpClient.did,
        network: network as NETWORK,
        matrix: {
          accessToken: matrixLogin.accessToken,
          userId: matrixLogin.userId,
          address: account.address,
          roomId: '',
        },
        name: results.name,
        pubKey: Buffer.from(account.pubkey).toString('hex'),
        ledgered: false,
        mode: 'offline',
        offlineConfig: {
          mnemonic: results.mnemonic,
        },
      });

      return {
        success: true,
        data: {
          message: 'Successfully logged in with offline wallet!',
          wallet: {
            address: account.address,
            did: secpClient.did,
            name: results.name,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? `Offline login failed: ${error.message}` : 'Unknown error',
      };
    }
  }
}
