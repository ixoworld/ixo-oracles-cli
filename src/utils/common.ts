import { select } from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { z } from 'zod';
import { RuntimeConfig } from './runtime-config';

export const selectNetwork = async (config: RuntimeConfig) => {
  const network = await select({
    message: 'Select network: (default: devnet)',
    options: [
      { value: 'mainnet', label: 'Mainnet' },
      { value: 'testnet', label: 'Testnet' },
      { value: 'devnet', label: 'Devnet' },
    ],
    initialValue: 'devnet',
    maxItems: 1,
  });

  config.addValue('network', network as NETWORK);

  return network as NETWORK;
};

export const RELAYER_NODE_DID = {
  mainnet: 'did:ixo:entity:2f22535f8b179a51d77a0e302e68d35d',
  testnet: 'did:ixo:entity:3d079ebc0b332aad3305bb4a51c72edb',
  devnet: 'did:ixo:entity:2f22535f8b179a51d77a0e302e68d35d',
};

export const MatrixHomeServerUrl: Record<NETWORK, string> = {
  devnet: 'https://devmx.ixo.earth',
  testnet: 'https://testmx.ixo.earth',
  mainnet: 'https://mx.ixo.earth',
};

export const MatrixRoomBotServerUrl: Record<NETWORK, string> = {
  devnet: 'https://rooms.bot.devmx.ixo.earth',
  testnet: 'https://rooms.bot.testmx.ixo.earth',
  mainnet: 'https://rooms.bot.mx.ixo.earth',
};

export const MatrixBotHomeServerUrl: Record<NETWORK, string> = {
  devnet: 'https://state.bot.devmx.ixo.earth',
  testnet: 'https://state.bot.testmx.ixo.earth',
  mainnet: 'https://state.bot.mx.ixo.earth',
};
export const PORTAL_URL = {
  devnet: 'https://ixo-portal.vercel.app',
  testnet: 'https://ixo-portal.vercel.app',
  mainnet: 'https://ixo-portal.vercel.app',
};

export const CHAIN_RPC = {
  mainnet: 'https://impacthub.ixo.world/rpc/',
  testnet: 'https://testnet.ixo.earth/rpc/',
  devnet: 'https://devnet.ixo.earth/rpc/',
};

export const checkRequiredString = (value: string, message = 'This  field is required') => {
  const schema = z.string().min(1, message);
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.message;
  }
  return undefined;
};

export const checkRequiredURL = (value: string, message = 'This url is required or a valid URL') => {
  const schema = z.url(message);
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.message;
  }
  return undefined;
};

export const checkRequiredNumber = (value: number, message = 'This number is required') => {
  const schema = z.number().min(1, message);
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.message;
  }
  return undefined;
};
