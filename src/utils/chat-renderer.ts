import * as p from '@clack/prompts';

/**
 * Streams assistant message text to stdout (no trailing newline — caller decides).
 */
export function renderAssistantMessage(content: string): void {
  process.stdout.write(content);
}

/**
 * Renders a tool call invocation in dim gray.
 */
export function renderToolCall(name: string, args: string): void {
  process.stdout.write(`\x1b[2m[Tool] ${name}(${args})\x1b[0m\n`);
}

/**
 * Renders an error message using clack.
 */
export function renderError(msg: string): void {
  p.log.error(msg);
}

/**
 * Renders a separator after a complete response.
 */
export function renderDone(): void {
  process.stdout.write('\n');
}

/**
 * Renders a personalized welcome banner when chat starts.
 */
export function renderWelcome(
  oracleName: string,
  orgName: string,
  description: string,
  sessionId: string,
): void {
  console.log();
  console.log(`\x1b[1m${oracleName}\x1b[0m by ${orgName}`);
  console.log(`\x1b[2m${description}\x1b[0m`);
  console.log();
  console.log(`\x1b[2mSession: ${sessionId}\x1b[0m`);
  console.log(`\x1b[2mType 'exit' to quit\x1b[0m`);
  console.log();
}
