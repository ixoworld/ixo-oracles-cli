import * as p from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { Command } from '.';
import { CLIResult } from '../types';
import { registerUserSimplified } from '../utils/account/simplifiedRegistration';
import { checkRequiredString, selectNetwork } from '../utils/common';
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
    const pin = await p.text({
      message: 'Enter your PIN',
      initialValue: '',
      validate(value) {
        return checkRequiredString(value, 'PIN is required');
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
        network,
        oracleAvatarUrl: `https://api.dicebear.com/8.x/bottts/svg?seed=${oracleName}`,
      },
      async (address) => {
        await this.wallet.sendTokens(address, 150_000); // 150,000 uixo = 0.15 IXO;
      }
    );
    return { success: true, data: user };
  }
}
