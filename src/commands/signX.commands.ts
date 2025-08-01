import { CLIResult } from '../types';
import { selectNetwork } from '../utils/common';
import { RuntimeConfig } from '../utils/runtime-config';
import { SignXClient } from '../utils/signx/signx';
import { Wallet } from '../utils/wallet';
import { Command } from './index';

export class SignXLoginCommand implements Command {
  name = 'signx-login';
  description = 'Login with SignX wallet';

  constructor(private wallet: Wallet, private config: RuntimeConfig) {}

  async execute(): Promise<CLIResult> {
    try {
      // Select network and create SignX client
      const network = await selectNetwork(this.config);
      const signXClient = new SignXClient(network);

      // Start login process
      const loginData = await signXClient.login();

      // Display QR code for user to scan
      signXClient.displayQRCode(loginData);

      // Wait for login completion
      const loginResult = await signXClient.awaitLogin();
      this.wallet.setWallet(loginResult);
      this.wallet.setSignXClient(signXClient);
      return {
        success: true,
        data: {
          message: 'Successfully logged in with SignX!',
          wallet: {
            address: loginResult.address,
            did: loginResult.did,
            name: loginResult.name,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? `SignX login failed: ${error.message}` : 'Unknown error',
      };
    }
  }
}
