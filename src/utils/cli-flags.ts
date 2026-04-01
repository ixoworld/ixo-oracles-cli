/**
 * Simple CLI flag parser. Extracts --key value and --boolean-flag from process.argv.
 * Supports: --flag value, --flag=value, --boolean-flag
 */
export function parseCliFlags(): Record<string, string> {
  const flags: Record<string, string> = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);

    // Handle --key=value
    if (key.includes('=')) {
      const eqIdx = key.indexOf('=');
      flags[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
      continue;
    }

    // Handle --key value
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++; // skip the value
    } else {
      flags[key] = 'true';
    }
  }

  return flags;
}
