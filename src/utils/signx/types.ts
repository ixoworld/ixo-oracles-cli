import { NETWORK } from '@ixo/signx-sdk/types/types/transact';

export type WalletMode = 'signx' | 'offline';

export interface MatrixLoginProps {
  address: string;
  accessToken: string;
  roomId: string;
  userId: string;
}

export interface OfflineWalletConfig {
  mnemonic: string;
}

export interface WalletProps {
  address: string;
  algo: string;
  did: string;
  network: NETWORK;
  matrix: MatrixLoginProps;
  name: string;
  pubKey: string;
  ledgered: boolean;
  mode?: WalletMode;
  offlineConfig?: OfflineWalletConfig;
}
