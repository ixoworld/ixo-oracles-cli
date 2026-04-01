import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const McpServerSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string().optional(),
});

const PromptConfigSchema = z.object({
  opening: z.string().optional(),
  communicationStyle: z.string().optional(),
  capabilities: z.string().optional(),
});

const OracleConfigSchema = z.object({
  oracleName: z.string(),
  orgName: z.string(),
  description: z.string(),
  location: z.string(),
  website: z.string(),
  price: z.number(),
  apiUrl: z.url(),
  network: z.string(),
  entityDid: z.string().regex(/^did:ixo:entity:[a-f0-9]{32}$/),
  logo: z.string(),
  // A4: Extended fields
  prompt: PromptConfigSchema.optional(),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
  customSkills: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema).optional(),
});

export interface McpServerConfig {
  name: string;
  url: string;
  description?: string;
}

export interface PromptConfig {
  opening?: string;
  communicationStyle?: string;
  capabilities?: string;
}

export interface OracleConfig {
  oracleName: string;
  orgName: string;
  description: string;
  location: string;
  website: string;
  price: number;
  apiUrl: string;
  network: string;
  entityDid: string;
  logo: string;
  // Extended fields
  prompt?: PromptConfig;
  model?: string;
  skills?: string[];
  customSkills?: string[];
  mcpServers?: McpServerConfig[];
}

/**
 * Saves oracle.config.json to both the project root (for CLI commands)
 * and apps/app/ (for the NestJS app's Docker build where turbo prune
 * only includes workspace packages).
 */
export function saveOracleConfig(projectPath: string, data: OracleConfig): void {
  const content = JSON.stringify(data, null, 2);
  const rootConfigPath = path.join(projectPath, 'oracle.config.json');
  writeFileSync(rootConfigPath, content, 'utf8');

  const appConfigPath = path.join(projectPath, 'apps', 'app', 'oracle.config.json');
  if (existsSync(path.dirname(appConfigPath))) {
    writeFileSync(appConfigPath, content, 'utf8');
  }
}

/**
 * Loads oracle.config.json from a given path, or walks up from cwd to find it.
 */
export function loadOracleConfig(projectPath?: string): OracleConfig | undefined {
  const root = projectPath ?? findProjectRoot();
  if (!root) return undefined;

  const configPath = path.join(root, 'oracle.config.json');
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = OracleConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    return parsed.data as OracleConfig;
  } catch {
    return undefined;
  }
}

/**
 * Walks up from cwd looking for oracle.config.json or pnpm-workspace.yaml to identify the project root.
 */
export function findProjectRoot(): string | undefined {
  let current = process.cwd();
  const root = path.parse(current).root;

  while (current !== root) {
    if (existsSync(path.join(current, 'oracle.config.json'))) {
      return current;
    }
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }

  return undefined;
}
