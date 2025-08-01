# IXO Oracles CLI - Development Guide

This guide explains how to develop and extend the IXO Oracles CLI, including how to create new commands and understand the existing architecture.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Command System](#command-system)
- [Creating New Commands](#creating-new-commands)
- [Available Utilities](#available-utilities)
- [Testing Commands](#testing-commands)
- [Best Practices](#best-practices)

## Architecture Overview

The CLI is built with a modular command system using TypeScript. Here's the high-level structure:

```
src/
├── cli.ts                    # Main CLI entry point
├── commands/                 # Command implementations
│   ├── index.ts             # Command interface and registry
│   ├── init.command.ts      # Project initialization
│   ├── create-entity-command.ts  # Blockchain entity creation
│   ├── signX.commands.ts    # SignX authentication
│   └── logout.commands.ts   # Logout functionality
├── types/                   # TypeScript interfaces
│   └── index.ts
├── utils/                   # Shared utilities
│   ├── wallet.ts           # Wallet management
│   ├── runtime-config.ts   # Configuration management
│   ├── errors.ts           # Error handling
│   └── ...                 # Other utilities
└── __tests__/              # Tests
```

## Command System

### Command Interface

All commands must implement the `Command` interface:

```typescript
export interface Command {
  name: string; // Command identifier
  description: string; // Command description for help
  execute: (...args: any[]) => Promise<CLIResult>;
}
```

### Command Registry

The `CommandRegistry` manages all available commands:

```typescript
export class CommandRegistry {
  private commands: Map<string, Command>;

  register(command: Command): void; // Register a new command
  get(name: string): Command | undefined; // Get command by name
  getAll(): Command[]; // Get all commands
  getCommandOptions(): Array<{ value: string; label: string; hint: string }>;
}
```

### CLI Result

All commands return a `CLIResult`:

```typescript
export interface CLIResult {
  success: boolean; // Whether the command succeeded
  data?: any; // Optional result data
  error?: string; // Error message if failed
}
```

## Creating New Commands

### Step 1: Create Command File

Create a new file in `src/commands/` following the naming convention:

- `your-command.command.ts` for main commands
- `your-command.commands.ts` for utility commands

### Step 2: Implement Command Interface

```typescript
import { CLIResult } from '../types';
import { Command } from './index';
import { Wallet } from '../utils/wallet';
import { RuntimeConfig } from '../utils/runtime-config';

export class YourCommand implements Command {
  name = 'your-command';
  description = 'Description of what your command does';

  constructor(private wallet: Wallet, private config: RuntimeConfig) {}

  async execute(): Promise<CLIResult> {
    try {
      // Your command logic here

      return {
        success: true,
        data: { message: 'Command executed successfully' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
```

### Step 3: Register Command

Add your command to the registry in `src/cli.ts`:

```typescript
import { YourCommand } from './commands/your-command.command';

// In the main function:
const registry = new CommandRegistry();
registry.register(new YourCommand(wallet, config));
```

### Step 4: Add User Prompts (Optional)

Use `@clack/prompts` for interactive prompts:

```typescript
import { text, select, confirm, spinner } from '@clack/prompts';

async execute(): Promise<CLIResult> {
  // Text input
  const name = await text({
    message: 'Enter your name:',
    placeholder: 'John Doe'
  });

  // Selection
  const option = await select({
    message: 'Choose an option:',
    options: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' }
    ]
  });

  // Confirmation
  const confirmed = await confirm({
    message: 'Are you sure?',
    initialValue: false
  });

  // Loading spinner
  const s = spinner();
  s.start('Processing...');
  // ... your logic
  s.stop('Completed!');
}
```

## Available Utilities

### Wallet Management

```typescript
import { Wallet } from '../utils/wallet';

// Access wallet properties
const address = wallet.address;
const did = wallet.did;
const name = wallet.name;

// Check if wallet exists
if (wallet.checkWalletExists()) {
  // Wallet is available
}

// Clear wallet (logout)
await wallet.clearWallet();
```

### Runtime Configuration

```typescript
import { RuntimeConfig } from '../utils/runtime-config';

const config = RuntimeConfig.getInstance();

// Set configuration values
config.addValue('projectPath', '/path/to/project');
config.addValue('projectName', 'my-oracle');

// Get configuration values
const projectPath = config.getValue('projectPath');
const projectName = config.getOrThrow('projectName'); // Throws if not set
```

### Error Handling

```typescript
import { handleError } from '../utils/errors';

try {
  // Your code
} catch (error) {
  handleError(error);
}
```

### Common Utilities

```typescript
import { selectNetwork, checkRequiredString, checkRequiredNumber, PORTAL_URL } from '../utils/common';

// Network selection
const network = await selectNetwork(config);

// Validation
const error = checkRequiredString(value, 'Field is required');
const error = checkRequiredNumber(parseInt(value), 'Must be a number');
```

## Existing Commands Reference

### 1. InitCommand (`init.command.ts`)

- **Purpose**: Initializes new IXO Oracle projects
- **Dependencies**: `RuntimeConfig`, `Wallet`, `CreateEntityCommand`
- **Key Features**:
  - Project directory creation
  - Repository cloning
  - Entity creation
  - Environment file generation

### 2. CreateEntityCommand (`create-entity-command.ts`)

- **Purpose**: Creates blockchain entities with linked resources
- **Dependencies**: `Wallet`, `RuntimeConfig`, `CreateEntity` utility
- **Key Features**:
  - Oracle profile creation
  - Linked resources setup
  - Matrix integration
  - Entity page configuration

### 3. SignXLoginCommand (`signX.commands.ts`)

- **Purpose**: Handles SignX authentication
- **Dependencies**: `Wallet`, `RuntimeConfig`, `SignXClient`
- **Key Features**:
  - QR code display
  - Mobile app integration
  - Wallet storage

### 4. LogoutCommand (`logout.commands.ts`)

- **Purpose**: Handles user logout
- **Dependencies**: `Wallet`
- **Key Features**:
  - Confirmation prompt
  - Wallet clearing

## Testing Commands

### Unit Testing

Create tests in `src/__tests__/`:

```typescript
import { YourCommand } from '../commands/your-command.command';
import { Wallet } from '../utils/wallet';
import { RuntimeConfig } from '../utils/runtime-config';

describe('YourCommand', () => {
  let command: YourCommand;
  let wallet: Wallet;
  let config: RuntimeConfig;

  beforeEach(() => {
    wallet = new Wallet();
    config = RuntimeConfig.getInstance();
    command = new YourCommand(wallet, config);
  });

  it('should execute successfully', async () => {
    const result = await command.execute();
    expect(result.success).toBe(true);
  });
});
```

### Integration Testing

Test command registration and execution:

```typescript
import { CommandRegistry } from '../commands';
import { YourCommand } from '../commands/your-command.command';

describe('Command Registry', () => {
  it('should register and execute commands', async () => {
    const registry = new CommandRegistry();
    const command = new YourCommand(wallet, config);

    registry.register(command);
    const retrieved = registry.get('your-command');

    expect(retrieved).toBe(command);
  });
});
```

## Best Practices

### 1. Error Handling

- Always wrap command logic in try-catch
- Return meaningful error messages
- Use the `handleError` utility for uncaught errors

### 2. User Experience

- Provide clear prompts and messages
- Use spinners for long-running operations
- Give helpful feedback on success/failure

### 3. Configuration

- Use `RuntimeConfig` for shared state
- Validate required configuration before execution
- Provide sensible defaults

### 4. Dependencies

- Inject dependencies through constructor
- Keep commands focused on single responsibility
- Use utility classes for shared functionality

### 5. Testing

- Write unit tests for all commands
- Mock external dependencies
- Test both success and failure scenarios

### 6. Documentation

- Add clear descriptions for commands
- Document complex logic with comments
- Update this guide when adding new patterns

## Example: Creating a Balance Command

Here's a complete example of creating a balance checking command:

```typescript
// src/commands/balance.command.ts
import { CLIResult } from '../types';
import { Command } from './index';
import { Wallet } from '../utils/wallet';
import { RuntimeConfig } from '../utils/runtime-config';
import { spinner } from '@clack/prompts';

export class BalanceCommand implements Command {
  name = 'balance';
  description = 'Check wallet balance on IXO blockchain';

  constructor(private wallet: Wallet, private config: RuntimeConfig) {}

  async execute(): Promise<CLIResult> {
    try {
      if (!this.wallet.checkWalletExists()) {
        return {
          success: false,
          error: 'Wallet not found. Please login first.',
        };
      }

      const s = spinner();
      s.start('Fetching balance...');

      // Simulate balance check
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const balance = {
        address: this.wallet.address,
        balance: '1000 IXO',
        network: this.config.getValue('network') || 'devnet',
      };

      s.stop('Balance fetched successfully');

      return {
        success: true,
        data: balance,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balance',
      };
    }
  }
}
```

Then register it in `src/cli.ts`:

```typescript
import { BalanceCommand } from './commands/balance.command';

// In the main function:
registry.register(new BalanceCommand(wallet, config));
```

This command will now appear in the interactive menu and can be executed by users.
