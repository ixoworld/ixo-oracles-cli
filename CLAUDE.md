# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IXO Oracles CLI — a Node.js CLI tool for provisioning AI Agent oracle projects on the IXO blockchain. It creates blockchain entities, provisions Matrix accounts for data storage, and scaffolds oracle projects from the ixo-oracles-boilerplate. Requires Node.js 22+ and the IXO Mobile App for SignX authentication.

## Build & Development Commands

| Command | Purpose |
|---|---|
| `pnpm build` | Build with tsup (single ESM bundle → `dist/cli.js`) |
| `pnpm dev` | Watch mode build |
| `pnpm start` | Run the built CLI (`node dist/cli.js`) |
| `pnpm test` | Run tests with Jest (ts-jest) |
| `pnpm lint` | ESLint on `src/**/*.ts` |
| `pnpm type-check` | `tsc --noEmit` |

The binary name is `oracles-cli`. Build produces a single `dist/cli.js` with shebang, targeting node22 via tsup.

## Architecture

### Command System

All commands implement `Command` interface (`src/commands/index.ts`) and return `CLIResult { success, data?, error? }`. Commands are registered in `CLIManager.registerCommands()` in `src/cli.ts`.

**Entry flow** (`src/cli.ts` → `CLIManager`):
1. Parse args: `--init` runs init directly, `--help` shows help, no args → interactive select menu
2. `handleAuthentication()` checks for persisted wallet (`~/.wallet.json`), prompts SignX login if missing
3. `registerCommands()` instantiates and registers all commands
4. Route to selected command's `execute()` method

**Adding a new command**: Create `src/commands/your-command.command.ts` implementing `Command`, register it in `CLIManager.registerCommands()`. See `docs/DEVELOPMENT.md` for detailed guide.

### Key Components

- **`Wallet`** (`src/utils/wallet.ts`) — Persists login state to `~/.wallet.json`. Holds `SignXClient` reference. Network is inferred from Matrix userId domain, not stored explicitly.
- **`RuntimeConfig`** (`src/utils/runtime-config.ts`) — Singleton for transient per-session state (projectPath, network, entityDid, registerUserResult). Use `config.addValue(key, value)` / `config.getOrThrow(key)`.
- **`SignXClient`** (`src/utils/signx/signx.ts`) — Wraps `@ixo/signx-sdk`. All blockchain transactions from the CLI user require mobile QR scanning. Flow: `transact()` → `displayTransactionQRCode()` → `pollNextTransaction()` → `awaitTransaction()`.
- **`CreateEntity`** (`src/utils/entity.ts`) — Core service for oracle entity provisioning. Orchestrates profile upload to Matrix, user registration, `MsgCreateEntity` broadcast, domain card/AuthZ/fees linked resource creation.
- **`registerUserSimplified()`** (`src/utils/account/simplifiedRegistration.ts`) — Creates a complete oracle identity: generates mnemonic → secp wallet → funds account → creates IID on-chain → provisions Matrix account with E2EE → stores encrypted mnemonic as room state.

### External Dependencies Pattern

- **Matrix as content store**: JSON documents (profile, domain card, configs) are uploaded to Matrix as unencrypted media. The `mxc://` URL becomes the `serviceEndpoint` in blockchain `LinkedResource`. `proof` field is a CID, not a signature.
- **Two Matrix roles**: The logged-in user's Matrix account (from SignX) handles media uploads. The oracle gets its own dedicated Matrix account provisioned by `registerUserSimplified()`.
- **SignX for all user transactions**: No local signing for entity/IID messages from the CLI user. Only exception: the oracle's IID is created with `signAndBroadcastWithMnemonic()` using the newly generated mnemonic.

### Conventions

- Interactive prompts use `@clack/prompts` (`p.group()`, `p.text()`, `p.select()`, `p.spinner()`)
- Input validation uses Zod via helpers in `src/utils/common.ts` (`checkRequiredString`, `checkRequiredURL`, `checkRequiredNumber`, `checkIsEntityDid`) — these return `string | undefined` to match clack's validation API
- Network URLs (RPC, Matrix, SignX, bots) are defined as constants in `src/utils/common.ts` keyed by `NETWORK` type (`devnet | testnet | mainnet`)
- Error handling uses custom classes in `src/utils/errors.ts` with `handleError()` utility
- Constructor injection for `Wallet` and `RuntimeConfig` into commands
