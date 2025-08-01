import { cosmos } from '@ixo/impactxclient-sdk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { SignXClient } from './signx/signx';
import { WalletProps } from './signx/types';

// Use hidden .wallet.json file in user's home directory
// const WALLET_PATH = path.join(os.homedir(), '.wallet.json');

// for dev make it here
const WALLET_PATH = path.join(__dirname, '.wallet.json');

export class Wallet {
  public wallet: WalletProps | undefined;
  public signXClient?: SignXClient;

  constructor() {
    this.loadWallet();
  }

  public setSignXClient(signXClient: SignXClient) {
    this.signXClient = signXClient;
  }

  private loadWallet() {
    if (existsSync(WALLET_PATH)) {
      try {
        const walletData = readFileSync(WALLET_PATH, 'utf8');
        this.wallet = JSON.parse(walletData) as WalletProps;
        // set signx client
        this.setSignXClient(new SignXClient(this.wallet.network ?? 'devnet'));
        console.log('Wallet loaded successfully');
      } catch (error) {
        console.warn('Failed to load wallet file:', error);
        this.wallet = undefined;
      }
    } else {
      console.log('No wallet file found');
    }
  }

  setWallet(wallet: WalletProps) {
    try {
      this.wallet = wallet;
      const walletJson = JSON.stringify(wallet, null, 2);
      writeFileSync(WALLET_PATH, walletJson, 'utf8');
      console.log('Wallet saved successfully to:', WALLET_PATH);
    } catch (error) {
      console.error('Failed to save wallet:', error);
      throw new Error('Failed to save wallet file');
    }
  }

  public checkWalletExists() {
    return existsSync(WALLET_PATH) && this.wallet !== undefined;
  }

  public async clearWallet() {
    this.wallet = undefined;
    try {
      if (existsSync(WALLET_PATH)) {
        await unlink(WALLET_PATH);
        console.log('Wallet file deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete wallet file:', error);
    }
  }

  get did() {
    return this.wallet?.did;
  }

  get address() {
    return this.wallet?.address;
  }

  get name() {
    return this.wallet?.name;
  }

  get pubKey() {
    return this.wallet?.pubKey;
  }

  get algo() {
    return this.wallet?.algo;
  }

  get matrix() {
    return this.wallet?.matrix;
  }

  public reloadWallet() {
    this.loadWallet();
  }

  async sendTokens(address: string, amount: number) {
    if (!this.address || !this.signXClient || !this.wallet) {
      throw new Error('Wallet not loaded');
    }
    const sendTokensToUserMsg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: cosmos.bank.v1beta1.MsgSend.fromPartial({
        fromAddress: this.address,
        toAddress: address,
        amount: [
          cosmos.base.v1beta1.Coin.fromPartial({
            amount: amount.toString(),
            denom: 'uixo',
          }),
        ],
      }),
    };
    const tx = await this.signXClient?.transact([sendTokensToUserMsg], this.wallet);
    this.signXClient?.displayTransactionQRCode(JSON.stringify(tx));
    await this.signXClient?.pollNextTransaction();
    const response = await this.signXClient?.awaitTransaction();
    return response;
  }
}
