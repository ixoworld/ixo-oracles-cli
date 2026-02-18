import * as p from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { Command } from '.';
import { CLIResult } from '../types';
import {
  checkRequiredMatrixUrl,
  checkRequiredNumber,
  checkRequiredString,
  checkRequiredURL,
  MatrixHomeServerUrl,
  PORTAL_URL,
  selectNetwork,
} from '../utils/common';
import { CreateEntity } from '../utils/entity';
import { RuntimeConfig } from '../utils/runtime-config';
import { Wallet } from '../utils/wallet';

export class CreateEntityCommand implements Command {
  name = 'create-entity';
  description = 'Create an entity';

  constructor(private wallet: Wallet, private config: RuntimeConfig) {}

  async execute(): Promise<CLIResult> {
    const network = this.config.getValue('network') as NETWORK;
    if (!network) {
      await selectNetwork(this.config);
    }

    // Determine default Matrix homeserver URL from wallet or static map
    const defaultMatrixUrl =
      this.wallet.matrixHomeServer ?? MatrixHomeServerUrl[(this.config.getValue('network') as NETWORK) ?? 'devnet'];

    const results = await p.group(
      {
        matrixHomeServerUrl: () =>
          p.text({
            message: 'Matrix homeserver URL for the oracle:',
            initialValue: defaultMatrixUrl,
            defaultValue: defaultMatrixUrl,
            validate(value) {
              return checkRequiredMatrixUrl(value);
            },
          }),
        oracleName: () =>
          p.text({
            message: 'What is the name of the oracle?',
            initialValue: 'My oracle',
            validate(value) {
              return checkRequiredString(value, 'Oracle name is required');
            },
          }),
        oraclePrice: () =>
          p.text({
            message: 'What is the price of the oracle in IXO CREDITS?',
            initialValue: '100',
            validate(value) {
              return checkRequiredNumber(parseInt(value ?? ''), 'Oracle price is required and must be a number');
            },
          }),
        profile: () =>
          p.group({
            orgName: () =>
              p.text({
                message: 'What is the name of the organization?',
                initialValue: 'IXO',
                validate(value) {
                  return checkRequiredString(value, 'Organization name is required');
                },
              }),
            name: () =>
              p.text({
                message: 'What is the name of the profile?',
                initialValue: 'My oracle',
                validate(value) {
                  return checkRequiredString(value, 'Profile name is required');
                },
              }),
            logo: ({ results }) =>
              p.text({
                message: 'What is the logo of the profile?',
                initialValue: `https://api.dicebear.com/8.x/bottts/svg?seed=${results?.name ?? 'IXO'}`,
                defaultValue: `https://api.dicebear.com/8.x/bottts/svg?seed=${results?.name ?? 'IXO'}`,
                validate(value) {
                  if (!value) return `https://api.dicebear.com/8.x/bottts/svg?seed=${results?.name ?? 'IXO'}`;
                  return checkRequiredURL(value, 'Logo is required or a valid URL');
                },
              }),
            coverImage: ({ results }) =>
              p.text({
                message: 'What is the cover image of the profile?',
                initialValue: results.logo as string,
                defaultValue: results.logo as string,
                validate(value) {
                  if (!value) return results.logo as string;
                  return checkRequiredURL(value, 'Cover image is required or a valid URL');
                },
              }),
            location: () =>
              p.text({
                message: 'What is the location of your domain?',
                initialValue: 'New York, NY',
                validate(value) {
                  return checkRequiredString(value, 'Location is required');
                },
              }),
            description: () =>
              p.text({
                message: 'What is the description of the entity (profile)?',
                initialValue: 'We are a company that helps you with daily tasks',
                validate(value) {
                  return checkRequiredString(value, 'Description is required');
                },
              }),
            url: () =>
              p.text({
                message: 'What is the website URL of the oracle? (optional, press Enter to skip)',
                placeholder: 'https://your-oracle-website.com',
              }),
          }),
        parentProtocol: () =>
          p.select({
            message: 'What is the parent protocol of the entity?',
            options: [
              {
                value: 'did:ixo:entity:1a76366f16570483cea72b111b27fd78',
                label: 'IXO Oracle Protocol',
                hint: 'default protocol',
              },
            ],
            initialValue: 'did:ixo:entity:1a76366f16570483cea72b111b27fd78',
          }),
        apiUrl: () =>
          p.text({
            message: 'What is the API URL of the oracle?',
            initialValue: 'http://localhost:4000',
            validate(value) {
              return checkRequiredURL(value, 'API URL is required or a valid URL');
            },
          }),
      },
      {
        // On Cancel callback that wraps the group
        // So if the user cancels one of the prompts in the group this function will be called
        onCancel: () => {
          p.cancel('Operation cancelled.');
          process.exit(0);
        },
      }
    );

    // Defer CreateEntity construction to execute() so matrixHomeServerUrl can be used
    const createEntity = new CreateEntity(this.wallet, this.config);

    const did = await createEntity.execute({
      oracleConfig: {
        oracleName: results.oracleName,
        price: parseInt(results.oraclePrice),
      },
      profile: {
        orgName: results.profile.orgName,
        name: results.profile.name,
        logo: results.profile.logo as string,
        coverImage: results.profile.coverImage as string,
        location: results.profile.location,
        description: results.profile.description,
        ...(results.profile.url ? { url: results.profile.url } : {}),
      },
      services: [
        {
          id: '{id}#api',
          serviceEndpoint: results.apiUrl,
          type: 'oracleService',
        },
        {
          id: '{id}#ws',
          serviceEndpoint: results.apiUrl,
          type: 'wsService',
        },
      ],
      parentProtocol: results.parentProtocol,
      matrixHomeServerUrl: results.matrixHomeServerUrl,
    });

    p.log.info(`API for the oracle is: ${results.apiUrl} | You can change this after you deploy the oracle`);

    // add to portal
    const portalBaseUrl = PORTAL_URL[(this.config.getValue('network') as NETWORK) ?? 'devnet'];

    const portalUrl = `${portalBaseUrl}/oracle/${did}/overview`;

    p.log.info(`Oracle created successfully: ${did}`);
    p.log.info(`Oracle URL: ${portalUrl}`);

    return {
      success: true,
      data: `Entity created successfully: ${did}`,
    };
  }
}
