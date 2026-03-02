import { CLIResult } from '../types';
import { Command, CommandRegistry } from './index';

export class HelpCommand implements Command {
  name = 'help';
  description = 'Show help information and available commands';

  constructor(private registry: CommandRegistry) {}

  async execute(): Promise<CLIResult> {
    const commands = this.registry.getAll();

    const helpText = `
QiForge CLI - Help

USAGE:
  qiforge-cli [command] [options]

COMMANDS:
${commands.map((cmd) => `  ${cmd.name.padEnd(15)} ${cmd.description}`).join('\n')}

EXAMPLES:
  qiforge-cli --init          Initialize a new IXO Oracle project
  qiforge-cli                 Launch interactive menu
  qiforge-cli help            Show this help message

OPTIONS:
  --init                      Initialize a new project (shortcut)
  --help, -h                  Show help information

For more information, visit: https://www.npmjs.com/package/qiforge-cli
`;

    return {
      success: true,
      data: helpText,
    };
  }
}
