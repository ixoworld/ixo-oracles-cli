export class CLIError extends Error {
  constructor(message: string, public code: string = 'CLI_ERROR', public suggestions?: string[]) {
    super(message);
    this.name = 'CLIError';
  }
}

export class ConfigError extends CLIError {
  constructor(message: string, suggestions?: string[]) {
    super(message, 'CONFIG_ERROR', suggestions);
    this.name = 'ConfigError';
  }
}

export class NetworkError extends CLIError {
  constructor(message: string, suggestions?: string[]) {
    super(message, 'NETWORK_ERROR', suggestions);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends CLIError {
  constructor(message: string, suggestions?: string[]) {
    super(message, 'VALIDATION_ERROR', suggestions);
    this.name = 'ValidationError';
  }
}

export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(`\n❌ ${error.name}: ${error.message}`);
    if (error.suggestions?.length) {
      console.error('\nSuggestions:');
      error.suggestions.forEach((suggestion) => console.error(`  • ${suggestion}`));
    }
    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(`\n❌ Unexpected Error: ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }

  console.error('\n❌ Unknown error occurred');
  process.exit(1);
}
