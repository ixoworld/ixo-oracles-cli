import * as p from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { Command } from '.';
import { CLIResult } from '../types';
import { registerUserSimplified } from '../utils/account/simplifiedRegistration';
import { logoutMatrixClient } from '../utils/account/matrix';
import { checkRequiredMatrixUrl, checkRequiredPin, checkRequiredString, MatrixHomeServerUrl, selectNetwork } from '../utils/common';
import { RuntimeConfig } from '../utils/runtime-config';
import { Wallet } from '../utils/wallet';

export class CreateUserCommand implements Command {
  name = 'create-user';
  description = 'Create a new user';
  constructor(private wallet: Wallet, private config: RuntimeConfig) {}
  async execute(): Promise<CLIResult> {
    const network = this.config.getValue('network') as NETWORK;
    if (!network) {
      await selectNetwork(this.config);
    }

    // Determine default Matrix homeserver URL from wallet or static map
    const defaultMatrixUrl =
      this.wallet.matrixHomeServer ?? MatrixHomeServerUrl[(this.config.getValue('network') as NETWORK) ?? 'devnet'];

    const matrixHomeServerUrl = await p.text({
      message: 'Matrix homeserver URL:',
      initialValue: defaultMatrixUrl,
      defaultValue: defaultMatrixUrl,
      validate(value) {
        return checkRequiredMatrixUrl(value);
      },
    });
    if (p.isCancel(matrixHomeServerUrl)) {
      p.log.error('User cancelled');
      process.exit(1);
    }

    const pin = await p.text({
      message: 'Enter a 6-digit PIN to secure your Matrix Vault:',
      placeholder: '123456',
      validate(value) {
        return checkRequiredPin(value);
      },
    });
    if (p.isCancel(pin)) {
      p.log.error('User cancelled');
      process.exit(1);
    }
    const oracleName = await p.text({
      message: 'Enter your oracle name',
      initialValue: 'My oracle',
      validate(value) {
        return checkRequiredString(value, 'Oracle name is required');
      },
    });
    if (p.isCancel(oracleName)) {
      p.log.error('User cancelled');
      process.exit(1);
    }
    const user = await registerUserSimplified(
      {
        pin,
        oracleName,
        network: (this.config.getValue('network') as NETWORK) ?? network,
        oracleAvatarUrl: `https://api.dicebear.com/8.x/bottts/svg?seed=${oracleName}`,
        matrixHomeServerUrl,
      },
      async (address) => {
        await this.wallet.sendTokens(address, 150_000); // 150,000 uixo = 0.15 IXO;
      }
    );

    // Logout oracle's Matrix session since create-user doesn't need it after
    await logoutMatrixClient({
      baseUrl: user.matrixHomeServerUrl,
      accessToken: user.matrixAccessToken,
      userId: user.matrixUserId,
      deviceId: '',
    });

    return { success: true, data: user };
  }
}
