import * as p from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { Command } from '.';
import { CLIResult } from '../types';
import { checkIsEntityDid, selectNetwork } from '../utils/common';
import { CreateEntity } from '../utils/entity';
import { RuntimeConfig } from '../utils/runtime-config';
import { Wallet } from '../utils/wallet';

export class UpdateEntityCommand implements Command {
  name = 'update-entity';
  description = 'Update an entity (add controllers, etc.)';
  private readonly createEntity: CreateEntity;

  constructor(private wallet: Wallet, private config: RuntimeConfig) {
    this.createEntity = new CreateEntity(this.wallet, this.config);
  }

  async execute(): Promise<CLIResult> {
    const network = this.config.getValue('network') as NETWORK;
    if (!network) {
      await selectNetwork(this.config);
    }

    const results = await p.group(
      {
        entityDid: () =>
          p.text({
            message: 'What is the DID of the entity you want to update?',
            initialValue: this.config.getValue('entityDid')?.toString() ?? '',
            validate(value) {
              return checkIsEntityDid(value.toString());
            },
          }),
        action: () =>
          p.select({
            message: 'What would you like to do?',
            options: [
              {
                value: 'add-controller',
                label: 'Add Controller',
                hint: 'Add a new controller DID to the entity',
              },
            ],
            initialValue: 'add-controller',
          }),
        controllerDid: async ({ results }): Promise<string> => {
          if (results.action !== 'add-controller') {
            throw new Error('Unknown action');
          }
          const did = await p.text({
            message: 'What is the DID of the controller you want to add?',
            validate(value) {
              return checkIsEntityDid(value.toString());
            },
          });
          if (p.isCancel(did)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
          }
          return did;
        },
      },
      {
        onCancel: () => {
          p.cancel('Operation cancelled.');
          process.exit(0);
        },
      }
    );

    try {
      if (results.action === 'add-controller' && typeof results.controllerDid === 'string') {
        const controllerDid = results.controllerDid;
        const entityDid = results.entityDid;
        p.log.info(`Adding controller ${controllerDid} to entity ${entityDid}`);
        await this.createEntity.addControllerToEntity(entityDid, controllerDid);
        p.log.success(`Controller ${controllerDid} successfully added to entity ${entityDid}`);
        return {
          success: true,
          data: `Controller ${controllerDid} added to entity ${entityDid}`,
        };
      }

      return {
        success: false,
        error: 'Unknown action',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
