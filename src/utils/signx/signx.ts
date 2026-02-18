import { toHex } from '@cosmjs/encoding';
import { EncodeObject } from '@cosmjs/proto-signing';
import { createRegistry } from '@ixo/impactxclient-sdk';
import {
  SignX as IxoSignX,
  SIGN_X_LOGIN_ERROR,
  SIGN_X_LOGIN_SUCCESS,
  SIGN_X_TRANSACT_ERROR,
  SIGN_X_TRANSACT_SUCCESS,
} from '@ixo/signx-sdk';
import { LOGIN_DATA } from '@ixo/signx-sdk/types/types/transact';
import qrcode from 'qrcode-terminal';
import { WalletProps } from './types';

const SignXEndpoints = {
  devnet: 'https://signx.devnet.ixo.earth',
  testnet: 'https://signx.testnet.ixo.earth',
  mainnet: 'https://signx.ixo.earth',
};

export class SignXClient {
  private readonly signXClient: IxoSignX;
  private _loginData?: LOGIN_DATA;
  public get loginData() {
    return this._loginData;
  }

  static loadFromWallet(wallet: WalletProps) {
    return new IxoSignX({
      endpoint: SignXEndpoints[wallet.network],
      sitename: 'IXO Oracles CLI',
      network: wallet.network,
    });
  }

  constructor(chainNetwork: keyof typeof SignXEndpoints) {
    this.signXClient = new IxoSignX({
      endpoint: SignXEndpoints[chainNetwork],
      sitename: 'IXO Oracles CLI',
      network: chainNetwork,
    });
  }

  async login() {
    const loginData = await this.signXClient.login({ pollingInterval: 2000, matrix: true });
    this._loginData = loginData;
    return loginData;
  }

  private displayStyledQRCode(qrCodeData: string | LOGIN_DATA, title: string) {
    const qrCodeStr = typeof qrCodeData === 'string' ? qrCodeData : JSON.stringify(qrCodeData);

    // Display title with emoji
    console.log('\n' + ' '.repeat(5) + '🔐 ' + title);
    console.log(' '.repeat(5) + '📱 Scan with IXO app');
    console.log(' '.repeat(5) + '━'.repeat(30));

    // Generate very compact QR code
    qrcode.generate(qrCodeStr, {
      small: true,
    });
    console.log(' '.repeat(5) + '⏳ Waiting...\n');
  }

  public displayQRCode(qrCodeData: string | LOGIN_DATA) {
    this.displayStyledQRCode(qrCodeData, 'Login with SignX');
  }

  async awaitLogin() {
    return new Promise<WalletProps>((resolve, reject) => {
      try {
        this.signXClient.on(SIGN_X_LOGIN_SUCCESS, (response: { data: WalletProps }) => {
          if (!response.data) {
            reject(new Error('Login failed'));
            return;
          }
          if (!response.data.matrix) {
            reject(new Error('Matrix login failed'));
            return;
          }
          resolve(response.data); // Resolve the promise with the login success data
        });

        this.signXClient.on(SIGN_X_LOGIN_ERROR, (error) => {
          console.log('Login error:', error);
          reject(error); // Reject the promise with the login error
        });

        // Use loginRequest data to show QR code to user for scanning by mobile app
      } catch (error) {
        console.error('Error in connecting:', error);
        reject(error); // Reject the promise with any other errors
      }
    });
  }

  async transact(messages: readonly EncodeObject[], wallet: WalletProps, memo?: string) {
    const registry = createRegistry();

    return this.signXClient.transact({
      address: wallet.address,
      did: wallet.did,
      pubkey: wallet.pubKey,
      timestamp: new Date().toISOString(),
      transactions: [
        {
          sequence: 1,
          txBodyHex: toHex(registry.encodeTxBody({ messages: messages, memo: memo || '' })),
        },
      ],
    });
  }

  async awaitTransaction() {
    return new Promise((resolve, reject) => {
      try {
        this.signXClient.on(SIGN_X_TRANSACT_SUCCESS, (result) => {
          resolve(result.data); // Resolve the promise with the login success data
        });

        this.signXClient.on(SIGN_X_TRANSACT_ERROR, (error) => {
          reject(error); // Reject the promise with the login error
        });
        // Use loginRequest data to show QR code to user for scanning by mobile app
      } catch (error) {
        console.error('Error in connecting:', error);
        reject(error); // Reject the promise with any other errors
      }
    });
  }

  async pollNextTransaction() {
    return this.signXClient.pollNextTransaction();
  }

  displayTransactionQRCode(qrCodeData: string) {
    this.displayStyledQRCode(qrCodeData, 'SIGNX TRANSACTION');
  }
}
