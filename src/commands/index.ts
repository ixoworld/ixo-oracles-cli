import { CLIResult } from '../types';

export interface Command {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<CLIResult>;
}

export class CommandRegistry {
  private commands: Map<string, Command>;

  constructor() {
    this.commands = new Map();
  }

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommandOptions() {
    return this.getAll().map((cmd) => ({
      value: cmd.name,
      label: cmd.name,
      hint: cmd.description,
    }));
  }
}
