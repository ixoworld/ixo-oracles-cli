import { log } from '@clack/prompts';
import { cosmos } from '@ixo/impactxclient-sdk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { RuntimeConfig } from './runtime-config';
import { SignXClient } from './signx/signx';
import { WalletProps } from './signx/types';

// Use hidden .wallet.json file in user's home directory
const WALLET_PATH = path.join(os.homedir(), '.wallet.json');

// for dev make it here
// const WALLET_PATH = path.join(__dirname, '.wallet.json');

export class Wallet {
  public wallet: WalletProps | undefined;
  public signXClient?: SignXClient;
  private config: RuntimeConfig;
  constructor(config: RuntimeConfig) {
    this.config = config;
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

        // get network from matrix
        // userid @did-ixo-ixo15a7p9d4n8wjh6wcsqk53g4yk7u3ztqpuymznxn:devmx.ixo.earth
        const mxDomain = this.wallet.matrix.userId?.split(':')[1];
        const mxDomainToNetwork = {
          'devmx.ixo.earth': 'devnet',
          'testmx.ixo.earth': 'testnet',
          'mx.ixo.earth': 'mainnet',
        } as const;
        const network = mxDomainToNetwork[mxDomain as keyof typeof mxDomainToNetwork];
        if (!network) {
          throw new Error('Invalid matrix domain');
        }
        this.wallet.network = network;
        this.config.addValue('network', network);

        // set signx client
        this.setSignXClient(new SignXClient(network));
        log.success(`Welcome back, ${this.wallet.name}!`);
        log.info(`Network: ${network}`);
      } catch (error) {
        log.warning(`Failed to load wallet file: ${error instanceof Error ? error.message : String(error)}`);
        this.wallet = undefined;
      }
    } else {
      log.warning('No wallet file found');
    }
  }

  setWallet(wallet: WalletProps) {
    try {
      this.wallet = wallet;

      const walletJson = JSON.stringify(wallet, null, 2);
      writeFileSync(WALLET_PATH, walletJson, 'utf8');
      log.success(`Wallet saved successfully to: ${WALLET_PATH}`);
    } catch (error) {
      log.error(`Failed to save wallet: ${error instanceof Error ? error.message : String(error)}`);
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
        log.success('Wallet file deleted successfully');
      }
    } catch (error) {
      log.error(`Failed to delete wallet file: ${error instanceof Error ? error.message : String(error)}`);
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
