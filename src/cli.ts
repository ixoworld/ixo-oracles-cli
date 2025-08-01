import { cancel, intro, isCancel, log, outro, select, spinner } from '@clack/prompts';
import process from 'node:process';
import { CommandRegistry } from './commands';
import { CreateEntityCommand } from './commands/create-entity-command';
import { HelpCommand } from './commands/help.command';
import { InitCommand } from './commands/init.command';
import { LogoutCommand } from './commands/logout.commands';
import { SignXLoginCommand } from './commands/signX.commands';
import { handleError } from './utils/errors';
import { RuntimeConfig } from './utils/runtime-config';
import { Wallet } from './utils/wallet';

class CLIManager {
  private registry: CommandRegistry;
  private config: RuntimeConfig;
  private wallet: Wallet;

  constructor() {
    this.registry = new CommandRegistry();
    this.config = RuntimeConfig.getInstance();
    this.wallet = new Wallet();
  }

  private registerCommands(): void {
    this.registry.register(new InitCommand(this.config, this.wallet));
    this.registry.register(new CreateEntityCommand(this.wallet, this.config));
    this.registry.register(new LogoutCommand(this.wallet));
    this.registry.register(new HelpCommand(this.registry));
  }

  private async showHelp(): Promise<void> {
    this.registerCommands();
    const helpCommand = new HelpCommand(this.registry);
    const result = await helpCommand.execute();
    if (result.success && result.data) {
      console.log(result.data);
    }
  }

  private async handleAuthentication(): Promise<void> {
    if (!this.wallet.checkWalletExists()) {
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
          const loginCommand = new SignXLoginCommand(this.wallet, this.config);
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
  }

  private async executeCommand(commandName: string): Promise<void> {
    const command = this.registry.get(commandName);
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    const s = spinner();
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
  }

  private async interactiveMode(): Promise<void> {
    intro('IXO CLI');
    log.warn('Keep your IXO Mobile App open while running the CLI; So u do not interrupt the signX session');

    await this.handleAuthentication();
    this.registerCommands();

    const action = await select({
      message: `Welcome ${this.wallet.name}, what would you like to do?`,
      options: [...this.registry.getCommandOptions()],
      initialValue: 'init',
    });

    if (isCancel(action)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    await this.executeCommand(String(action));
  }

  private async argumentMode(args: string[]): Promise<void> {
    const command = args[0];

    if (!command) {
      await this.interactiveMode();
      return;
    }

    // Handle special flags
    if (command === '--init') {
      await this.handleAuthentication();
      this.registerCommands();
      await this.executeCommand('init');
      return;
    }

    // Handle help
    if (command === '--help' || command === '-h') {
      await this.showHelp();
      return;
    }

    // Handle direct command execution
    await this.handleAuthentication();
    this.registerCommands();
    await this.executeCommand(command);
  }

  async run(args: string[]): Promise<void> {
    try {
      // Remove the first two args (node path and script path)
      const userArgs = args.slice(2);

      if (userArgs.length === 0) {
        await this.interactiveMode();
      } else {
        await this.argumentMode(userArgs);
      }
    } catch (error) {
      handleError(error);
    }

    outro('Thanks for using IXO CLI!');
    process.exit(0);
  }
}

// Handle uncaught errors
process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

// Start the CLI
const cli = new CLIManager();
cli.run(process.argv);
