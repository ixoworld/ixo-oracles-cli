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

export const DOMAIN_INDEXER_URL: Record<NETWORK, string> = {
  devnet: 'https://domain-indexer.devnet.ixo.earth/index',
  testnet: 'https://domain-indexer.testnet.ixo.earth/index',
  mainnet: 'https://domain-indexer.ixo.earth/index',
};

export const checkRequiredString = (value: string | undefined, message = 'This  field is required') => {
  const schema = z.string().min(1, message);
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.message;
  }
  return undefined;
};

export const checkIsEntityDid = (value: string | undefined) => {
  const schema = z.string().regex(/^did:ixo:entity:[a-f0-9]{32}$/, 'Invalid entity DID');
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.message;
  }
  return undefined;
};

export const checkRequiredURL = (value: string | undefined, message = 'This url is required or a valid URL') => {
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

export const checkRequiredPin = (value: string | undefined) => {
  const schema = z
    .string()
    .min(1, 'PIN is required')
    .refine((v) => /^\d{6}$/.test(v), 'PIN must be exactly 6 digits');
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.issues[0]?.message ?? 'Invalid PIN';
  }
  return undefined;
};

export const checkRequiredMatrixUrl = (value: string | undefined) => {
  const schema = z
    .string()
    .min(1, 'Matrix homeserver URL is required')
    .refine((v) => /^https?:\/\//.test(v), 'Must start with http:// or https://')
    .refine((v) => !v.endsWith('/'), 'Must not end with a trailing slash');
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.issues[0]?.message ?? 'Invalid Matrix URL';
  }
  return undefined;
};

export interface MatrixUrls {
  homeServerUrl: string;
  roomBotUrl: string;
  stateBotUrl: string;
  bidsBotUrl: string;
  claimsBotUrl: string;
}

/**
 * Derives all Matrix bot URLs from a homeserver URL using subdomain convention.
 * e.g. https://devmx.ixo.earth → https://rooms.bot.devmx.ixo.earth
 */
export function deriveMatrixUrls(homeServerUrl: string): MatrixUrls {
  const url = new URL(homeServerUrl);
  const domain = url.hostname;
  const protocol = url.protocol;

  return {
    homeServerUrl,
    roomBotUrl: `${protocol}//rooms.bot.${domain}`,
    stateBotUrl: `${protocol}//state.bot.${domain}`,
    bidsBotUrl: `${protocol}//bids.bot.${domain}`,
    claimsBotUrl: `${protocol}//claims.bot.${domain}`,
  };
}
