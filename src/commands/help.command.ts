import { CLIResult } from '../types';
import { Command, CommandRegistry } from './index';

export class HelpCommand implements Command {
  name = 'help';
  description = 'Show help information and available commands';

  constructor(private registry: CommandRegistry) {}

  async execute(): Promise<CLIResult> {
    const commands = this.registry.getAll();

    const helpText = `
IXO Oracles CLI - Help

USAGE:
  oracles-cli [command] [options]

COMMANDS:
${commands.map((cmd) => `  ${cmd.name.padEnd(15)} ${cmd.description}`).join('\n')}

EXAMPLES:
  oracles-cli --init          Initialize a new IXO Oracle project
  oracles-cli                 Launch interactive menu
  oracles-cli help            Show this help message

OPTIONS:
  --init                      Initialize a new project (shortcut)
  --help, -h                  Show help information

For more information, visit: https://github.com/ixoworld/ixo-oracles-cli
`;

    return {
      success: true,
      data: helpText,
    };
  }
}
