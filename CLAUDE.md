# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QiForge CLI — a Node.js CLI tool for provisioning AI Agent oracle projects on the IXO blockchain. It creates blockchain entities, provisions Matrix accounts for data storage, and scaffolds oracle projects from the qiforge. Requires Node.js 22+. Supports two authentication modes: SignX (QR code via IXO Mobile App) or offline wallet (local mnemonic + Matrix password).

## Build & Development Commands

| Command | Purpose |
|---|---|
| `pnpm build` | Build with tsup (single ESM bundle → `dist/cli.js`) |
| `pnpm dev` | Watch mode build |
| `pnpm start` | Run the built CLI (`node dist/cli.js`) |
| `pnpm test` | Run tests with Jest (ts-jest) |
| `pnpm lint` | ESLint on `src/**/*.ts` |
| `pnpm type-check` | `tsc --noEmit` |

The binary name is `qiforge-cli`. Build produces a single `dist/cli.js` with shebang, targeting node22 via tsup.

## Architecture

### Command System

All commands implement `Command` interface (`src/commands/index.ts`) and return `CLIResult { success, data?, error? }`. Commands are registered in `CLIManager.registerCommands()` in `src/cli.ts`.

**Entry flow** (`src/cli.ts` → `CLIManager`):
1. Parse args: `--init` runs init directly, `--help` shows help, no args → interactive select menu
2. `handleAuthentication()` checks for persisted wallet (`~/.wallet.json`), prompts login choice (SignX or Offline) if missing
3. `registerCommands()` instantiates and registers all commands
4. Route to selected command's `execute()` method

**Adding a new command**: Create `src/commands/your-command.command.ts` implementing `Command`, register it in `CLIManager.registerCommands()`. See `docs/DEVELOPMENT.md` for detailed guide.

### Key Components

- **`Wallet`** (`src/utils/wallet.ts`) — Persists login state to `~/.wallet.json`. Supports two modes via `WalletProps.mode`: `'signx'` (default, QR-based) and `'offline'` (local mnemonic). The `signAndBroadcast(msgs)` method abstracts signing — delegates to SignX QR flow or local `signAndBroadcastWithMnemonic()`. All command code calls `wallet.signAndBroadcast()` instead of touching `signXClient` directly.
- **`OfflineLoginCommand`** (`src/commands/offline-login.command.ts`) — Login flow for offline mode: prompts for mnemonic, display name, Matrix username/password. Derives wallet via `getSecpClient()`, authenticates Matrix via `mxLoginRaw()`, persists with `mode: 'offline'`.
- **`RuntimeConfig`** (`src/utils/runtime-config.ts`) — Singleton for transient per-session state (projectPath, network, entityDid, registerUserResult). Use `config.addValue(key, value)` / `config.getOrThrow(key)`.
- **`SignXClient`** (`src/utils/signx/signx.ts`) — Wraps `@ixo/signx-sdk`. Used only in SignX mode. Flow: `transact()` → `displayTransactionQRCode()` → `pollNextTransaction()` → `awaitTransaction()`.
- **`CreateEntity`** (`src/utils/entity.ts`) — Core service for oracle entity provisioning. Orchestrates profile upload to Matrix, user registration, `MsgCreateEntity` broadcast, domain card/AuthZ/fees linked resource creation.
- **`registerUserSimplified()`** (`src/utils/account/simplifiedRegistration.ts`) — Creates a complete oracle identity: generates mnemonic → secp wallet → funds account → creates IID on-chain → provisions Matrix account with E2EE → stores encrypted mnemonic as room state.

### External Dependencies Pattern

- **Matrix as content store**: JSON documents (profile, domain card, configs) are uploaded to Matrix as unencrypted media. The `mxc://` URL becomes the `serviceEndpoint` in blockchain `LinkedResource`. `proof` field is a CID, not a signature.
- **Two Matrix roles**: The logged-in user's Matrix account (from SignX) handles media uploads. The oracle gets its own dedicated Matrix account provisioned by `registerUserSimplified()`.
- **Dual signing modes**: In SignX mode, all user transactions require mobile QR scanning. In offline mode, transactions are signed locally with the stored mnemonic via `signAndBroadcastWithMnemonic()`. The `Wallet.signAndBroadcast()` method abstracts this — commands are mode-agnostic. The oracle's own IID is always created with `signAndBroadcastWithMnemonic()` using its newly generated mnemonic regardless of mode.

### Conventions

- Interactive prompts use `@clack/prompts` (`p.group()`, `p.text()`, `p.select()`, `p.spinner()`)
- Input validation uses Zod via helpers in `src/utils/common.ts` (`checkRequiredString`, `checkRequiredURL`, `checkRequiredNumber`, `checkIsEntityDid`) — these return `string | undefined` to match clack's validation API
- Network URLs (RPC, Matrix, SignX, bots) are defined as constants in `src/utils/common.ts` keyed by `NETWORK` type (`devnet | testnet | mainnet`)
- Error handling uses custom classes in `src/utils/errors.ts` with `handleError()` utility
- Constructor injection for `Wallet` and `RuntimeConfig` into commands
