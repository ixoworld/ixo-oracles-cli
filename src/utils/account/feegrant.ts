import { Coin, DecodeObject } from '@cosmjs/proto-signing';
import { createRegistry, utils } from '@ixo/impactxclient-sdk';
import { Grant } from '@ixo/impactxclient-sdk/types/codegen/cosmos/feegrant/v1beta1/feegrant';
import { Timestamp } from '@ixo/impactxclient-sdk/types/codegen/google/protobuf/timestamp';

/**
 * Converts a timestamp object to a timestamp
 * @param timestamp - The timestamp object to convert
 * @returns The timestamp
 */
export function convertTimestampObjectToTimestamp(timestamp: Timestamp): number | undefined {
  try {
    const date = utils.proto.fromTimestamp(timestamp);

    return date.getTime();
  } catch (error) {
    return undefined;
  }
}

export enum FeegrantTypes {
  BASIC_ALLOWANCE = 'BasicAllowance',
  PERIODIC_ALLOWANCE = 'PeriodicAllowance',
}

export const FEEGRANT_TYPES: Record<FeegrantTypes, string> = {
  BasicAllowance: '/cosmos.feegrant.v1beta1.BasicAllowance',
  PeriodicAllowance: '/cosmos.feegrant.v1beta1.PeriodicAllowance',
};

/**
 * Decodes the grant values from the the user's list of allowances
 * @param grants - The grants to decode
 * @returns The decoded grants
 */
export const decodeGrants = (grants: Grant[]) => {
  const registry = createRegistry();

  return (grants ?? []).map((grant) => {
    const allowance = grant.allowance as DecodeObject;
    const decodedAllowance = registry.decode(allowance);
    // decodedAllowance.
    switch (allowance.typeUrl) {
      case FEEGRANT_TYPES.BasicAllowance:
        return {
          granter: grant.granter,
          grantee: grant.grantee,
          type: FEEGRANT_TYPES.BasicAllowance,
          expiration: decodedAllowance.expiration
            ? convertTimestampObjectToTimestamp(decodedAllowance.expiration)
            : null,
          limit: decodedAllowance.spendLimit?.length
            ? decodedAllowance.spendLimit.find((limit: Coin) => limit.denom === 'uixo')?.amount
            : null,
          msgs: [],
        };
      case FEEGRANT_TYPES.PeriodicAllowance:
        return {
          granter: grant.granter,
          grantee: grant.grantee,
          type: FEEGRANT_TYPES.PeriodicAllowance,
          expiration: decodedAllowance.basic?.expiration
            ? convertTimestampObjectToTimestamp(decodedAllowance.basic.expiration)
            : null,
          limit: decodedAllowance?.periodCanSpend
            ? decodedAllowance?.periodCanSpend?.find((limit: Coin) => limit.denom === 'uixo')?.amount
            : decodedAllowance?.basic?.spendLimit?.length
            ? decodedAllowance?.basic?.spendLimit?.find((limit: Coin) => limit.denom === 'uixo')?.amount
            : null,
          msgs: [],
        };
      default:
        return {
          type: allowance.typeUrl,
          granter: grant.granter,
          grantee: grant.grantee,
          expiration: decodedAllowance.expiration
            ? convertTimestampObjectToTimestamp(decodedAllowance.expiration)
            : decodedAllowance.basic?.expiration
            ? convertTimestampObjectToTimestamp(decodedAllowance.basic.expiration)
            : null,
          limit: decodedAllowance.spendLimit?.length
            ? decodedAllowance.spendLimit.find((limit: Coin) => limit.denom === 'uixo')?.amount
            : decodedAllowance?.periodCanSpend
            ? decodedAllowance?.periodCanSpend?.find((limit: Coin) => limit.denom === 'uixo')?.amount
            : decodedAllowance?.basic?.spendLimit?.length
            ? decodedAllowance?.basic?.spendLimit?.find((limit: Coin) => limit.denom === 'uixo')?.amount
            : null,
          msgs: decodedAllowance.allowedMessages,
        };
    }
  });
};

/**
 * Checks if the allowance has expired
 * @param expiration - The expiration of the allowance
 * @returns True if the allowance has expired, false otherwise
 */
export const isAllowanceExpired = (expiration: number | Timestamp) => {
  if (expiration === null || expiration === undefined) {
    return false;
  }
  const expirationTimestamp =
    typeof expiration === 'object' ? convertTimestampObjectToTimestamp(expiration) : expiration;
  if (expirationTimestamp === undefined || expirationTimestamp === null) {
    // failed to decode or convert - assume expired
    return true;
  }
  return expirationTimestamp < Date.now();
};

/**
 * Checks if the allowance limit has been reached
 * @param limit - The limit of the allowance
 * @returns True if the allowance limit has been reached, false otherwise
 */
export const isAllowanceLimitReached = (limit: number | string | Coin) => {
  if (limit === null || limit === undefined) {
    return false;
  }
  const limitAmount =
    typeof limit === 'object' ? Number(limit?.amount ?? 0) : typeof limit === 'string' ? Number(limit ?? 0) : limit;
  return limitAmount <= 0.0005;
};
