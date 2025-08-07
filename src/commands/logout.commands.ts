import { confirm } from '@clack/prompts';
import { CLIResult } from '../types';
import { Wallet } from '../utils/wallet';
import { Command } from './index';

export class LogoutCommand implements Command {
  name = 'logout';
  description = 'Logout command';

  constructor(private wallet: Wallet) {}

  async execute(): Promise<CLIResult> {
    const shouldClear = await confirm({
      message: 'Are you sure you want to logout?',
      initialValue: false,
    });
    if (shouldClear) {
      await this.wallet.clearWallet();
      return {
        success: true,
        data: 'Logged out successfully',
      };
    }
    return {
      success: false,
      error: 'Logout cancelled',
    };
  }
}
