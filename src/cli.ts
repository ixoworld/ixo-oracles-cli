import { cancel, intro, isCancel, log, outro, select, spinner } from '@clack/prompts';
import process from 'node:process';
import { CommandRegistry } from './commands';
import { CreateEntityCommand } from './commands/create-entity-command';
import { InitCommand } from './commands/init.command';
import { LogoutCommand } from './commands/logout.commands';
import { SignXLoginCommand } from './commands/signX.commands';
import { handleError } from './utils/errors';
import { RuntimeConfig } from './utils/runtime-config';
import { Wallet } from './utils/wallet';

async function main(args: string[]) {
  intro('IXO CLI');
  log.warn('Keep your IXO Mobile App open while running the CLI; So u do not interrupt the signX session');
  try {
    const config = RuntimeConfig.getInstance();
    const wallet = new Wallet();
    // first login

    if (!wallet.checkWalletExists()) {
      const login = await select({
        message: 'Login with SignX',
        options: [
          { value: 'login', label: 'Login' },
          { value: 'exit', label: 'Exit' },
        ],
      });

      if (isCancel(login)) {
        cancel('Operation cancelled.');
        process.exit(0);
      }

      switch (String(login)) {
        case 'login':
          const loginCommand = new SignXLoginCommand(wallet, config);
          const result = await loginCommand.execute();
          if (result.success) {
            log.success('Login successful');
          }
          break;
        case 'exit':
          cancel('Operation cancelled.');
          process.exit(0);
        default:
          throw new Error(`Unknown command: ${login}`);
      }
    }

    const registry = new CommandRegistry();

    const shouldRunInitCommand = args.includes('--init');

    registry.register(new InitCommand(config, wallet));

    registry.register(new CreateEntityCommand(wallet, config));
    registry.register(new LogoutCommand(wallet));

    const action = shouldRunInitCommand
      ? 'init'
      : await select({
          message: `Welcome ${wallet.name}, what would you like to do?`,
          options: [...registry.getCommandOptions()],
          initialValue: 'init',
        });

    if (isCancel(action)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    const s = spinner();

    const commandName = String(action);
    const command = registry.get(commandName);
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    s.start(`Executing ${command.name}...`);
    const result = await command.execute();
    s.stop(`${command.name} completed`);

    if (result.success) {
      log.success(`${command.name} completed successfully!`);
      if (result.data) {
        log.info(JSON.stringify(result.data, null, 2));
      }
    } else {
      log.error(`${command.name} failed: ${result.error}`);
    }
  } catch (error) {
    handleError(error);
  }

  outro('Thanks for using IXO CLI!');
  process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

main(process.argv);
