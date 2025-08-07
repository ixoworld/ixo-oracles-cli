import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import { Command } from '.';
import { CLIResult } from '../types';
import { createProjectEnvFile } from '../utils/create-project-env-file';
import { RuntimeConfig } from '../utils/runtime-config';
import { Wallet } from '../utils/wallet';
import { CreateEntityCommand } from './create-entity-command';

export class InitCommand implements Command {
  name = 'init';
  description = 'Initialize Project';

  constructor(private readonly config: RuntimeConfig, private readonly wallet: Wallet) {}

  private async getProjectInput(): Promise<{ projectPath: string; projectName: string }> {
    // Get the input from user (could be path, name, or both)
    const input = await p.text({
      message: 'What is your project named?',
      placeholder: 'my-ixo-project',
      validate(value) {
        if (!value) {
          return 'Project name is required';
        }
        return undefined;
      },
    });

    if (p.isCancel(input)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    // Parse the input to determine if it's a path, name, or both
    const inputStr = String(input);
    let projectPath: string;
    let projectName: string;

    // Check if input contains path separators (is a path)
    if (inputStr.includes('/') || inputStr.includes('\\')) {
      // Input is a path
      projectPath = inputStr;
      projectName = path.basename(inputStr);
    } else {
      // Input is just a name, create in current directory
      projectName = inputStr;
      projectPath = path.join(process.cwd(), projectName);
    }

    // Ensure the project name is valid
    if (!this.isValidProjectName(projectName)) {
      p.note('Invalid project name. Using a valid name instead.', 'Warning');
      projectName = this.sanitizeProjectName(projectName);
      projectPath = path.join(path.dirname(projectPath), projectName);
    }

    return { projectPath, projectName };
  }

  private isValidProjectName(name: string): boolean {
    // Check if name is valid (no special characters, starts with letter, etc.)
    const validNameRegex = /^[a-zA-Z][a-zA-Z0-9-_]*$/;
    return validNameRegex.test(name) && name.length > 0 && name.length <= 50;
  }

  private sanitizeProjectName(name: string): string {
    // Convert invalid characters to valid ones
    return name
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .toLowerCase()
      .substring(0, 50);
  }

  private async confirmProjectCreation(projectPath: string, projectName: string): Promise<boolean> {
    const isDirExists = existsSync(projectPath);

    if (isDirExists) {
      const overwrite = await p.confirm({
        message: `Directory "${projectPath}" already exists. Do you want to overwrite it?`,
        initialValue: false,
      });

      if (p.isCancel(overwrite)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }

      return overwrite;
    }

    // Show confirmation for new project
    const confirm = await p.confirm({
      message: `Create IXO project "${projectName}" in "${projectPath}"?`,
      initialValue: true,
    });

    if (p.isCancel(confirm)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    return confirm;
  }

  private async selectRepo() {
    const repo = await p.select({
      message: 'Select a template to clone',
      options: [
        {
          value: 'git@github.com:ixoworld/ixo-oracles-boilerplate.git',
          label: 'IXO Oracles (Default)',
        },
        {
          label: 'Custom template',
          value: 'custom',
        },
      ],
    });

    if (p.isCancel(repo)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    if (repo === 'custom') {
      const customRepo = await p.text({
        message: 'Enter the custom template URL',
      });

      if (p.isCancel(customRepo)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }

      return customRepo;
    }

    return repo;
  }

  private async cloneRepo(repo: string, projectPath: string, shouldOverwrite: boolean = false) {
    const git = simpleGit();
    const cloneSpinner = p.spinner();

    try {
      cloneSpinner.start('Cloning repository...');

      // If overwriting, remove the existing directory first
      if (shouldOverwrite && existsSync(projectPath)) {
        const { rmSync } = await import('fs');
        rmSync(projectPath, { recursive: true, force: true });
      }

      // Create directory if it doesn't exist

      await git.clone(repo, projectPath);

      // Clean repo and create new git
      const gitFolder = path.join(projectPath, '.git');
      if (existsSync(gitFolder)) {
        const { rmSync } = await import('fs');
        rmSync(gitFolder, { recursive: true, force: true });
      }
      await simpleGit(projectPath).init();

      cloneSpinner.stop('Repository cloned successfully');

      p.log.info('Creating Oracle Entity and Matrix Account');
      const command = new CreateEntityCommand(this.wallet, this.config);
      const result = await command.execute();
      if (result.success) {
        p.log.info('Oracle Entity and Matrix Account created successfully');
      } else {
        p.log.error('Failed to create Oracle Entity and Matrix Account');
      }

      await createProjectEnvFile(this.config);
      // Show success message with next steps
      p.log.success(
        `\n✅ IXO project created successfully!\n\n` +
          `📁 Location: ${projectPath}\n` +
          `🚀 Next steps:\n` +
          `   cd ${path.basename(projectPath)}\n` +
          `   pnpm install\n` +
          `   pnpm build \n` +
          `   cd apps/app\n` +
          `   pnpm start:dev`
      );
    } catch (error) {
      cloneSpinner.stop('Failed to clone repository');
      throw error;
    }
  }

  async execute(): Promise<CLIResult> {
    try {
      // Get project input (path and/or name)
      const { projectPath, projectName } = await this.getProjectInput();

      // Confirm project creation
      const shouldProceed = await this.confirmProjectCreation(projectPath, projectName);

      if (!shouldProceed) {
        return { success: false, data: 'Project creation cancelled' };
      }

      // Store in config
      this.config.addValue('projectPath', projectPath);
      this.config.addValue('projectName', projectName);

      // Select repository template
      const repo = await this.selectRepo();
      this.config.addValue('repo', repo);

      // Check if we need to overwrite
      const shouldOverwrite = existsSync(projectPath);

      // Clone the repository
      await this.cloneRepo(repo, projectPath, shouldOverwrite);

      return {
        success: true,
        data: `Project "${projectName}" created successfully in "${projectPath}"`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
