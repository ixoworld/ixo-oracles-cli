// Common types for the CLI

export interface CLIResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface QueryOptions {
  query: string;
  limit?: number;
  offset?: number;
}

export interface SubmitOptions {
  data: any;
  type: string;
  validate?: boolean;
}
