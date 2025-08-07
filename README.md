# IXO Oracles CLI

A command-line interface for creating and managing IXO Oracle projects. This CLI helps you set up AI Agent oracles built with LangGraph, using Matrix as a datastore with linked resources stored on the IXO blockchain.

## What is IXO Oracles CLI?

The IXO Oracles CLI automates the complete setup of AI Agent oracle projects. It handles:

- **Blockchain Integration**: Creates entities on the IXO blockchain with linked resources stored in Matrix
- **Matrix Account Creation**: Sets up Matrix accounts for data storage and communication
- **Project Initialization**: Clones the [IXO Oracles boilerplate](https://github.com/ixoworld/ixo-oracles-boilerplate) and configures the environment
- **Authentication**: Integrates with SignX for secure blockchain operations

## Prerequisites

- Node.js 22+
- IXO Mobile App (for SignX authentication)

## Installation

Install the CLI globally using npm:

```bash
npm install -g ixo-oracles-cli
```

Or with pnpm:

```bash
pnpm add -g ixo-oracles-cli
```

**Important for pnpm users:** After installation, you need to approve build scripts:

```bash
pnpm approve-builds -g
```

When prompted, select `protobufjs` and approve it:

```
✔ Choose which packages to build · protobufjs
✔ The next packages will now be built: protobufjs.
Do you approve? (y/N) · true
```

Or with yarn:

```bash
yarn global add ixo-oracles-cli
```

## Quick Start

1. **Initialize a new oracle project:**

   ```bash
   oracles-cli --init
   ```

2. **Or run the interactive CLI:**

   ```bash
   oracles-cli
   ```

3. **Follow the prompts:**
   - First-time users will need to login with SignX (keep your IXO Mobile App open)
   - Enter your project name
   - Select the template (IXO Oracles boilerplate or custom)
   - Configure your oracle details

## Commands

### `oracles-cli --init` - Initialize Project

Creates a new IXO Oracle project with all necessary components:

- **Project Setup**: Creates directory and clones the IXO Oracles boilerplate
- **Entity Creation**: Creates a blockchain entity with linked resources stored in Matrix
- **Matrix Account**: Sets up Matrix account for data storage
- **Environment Configuration**: Creates `.env` file with all necessary variables

### `oracles-cli` - Interactive Menu

Launches an interactive menu with the following options:

- **init** - Initialize a new project
- **create-entity** - Create a blockchain entity
- **logout** - Sign out

### Other Commands

- **create-entity** - Create an entity with oracle profile, linked resources, and metadata
- **logout** - Clear your authentication session
- **help** - Show help information and available commands

## Project Structure

After initialization, your project will have:

```
your-oracle-project/
├── apps/
│   └── app/
│       ├── .env              # Environment configuration
│       └── ...               # Application files
├── packages/                 # Shared packages
└── ...                      # Other project files
```

## Environment Configuration

The CLI automatically creates a `.env` file with:

```env
PORT=4000
ORACLE_NAME=your-oracle-name

# Matrix Configuration
MATRIX_BASE_URL=https://matrix.ixo.world
MATRIX_ORACLE_ADMIN_ACCESS_TOKEN=your-access-token
MATRIX_ORACLE_ADMIN_PASSWORD=your-password
MATRIX_ORACLE_ADMIN_USER_ID=your-user-id

# AI/ML Services (configure as needed)
OPENAI_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
OPEN_ROUTER_API_KEY=

# Blockchain Details (store securely)
ORACLE_ADDRESS=your-address
ORACLE_DID=your-did
ORACLE_MNEMONIC=your-mnemonic
MATRIX_VAULT_PIN=your-pin
ENTITY_DID=your-entity-did
```

## Authentication

The CLI uses SignX for authentication:

1. Keep your IXO Mobile App open during the login process
2. Follow the QR code or manual authentication prompts
3. Your credentials are securely stored locally for future use

## Next Steps

After project initialization:

1. **Navigate to your project:**

   ```bash
   cd your-project-name
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Build the project:**

   ```bash
   pnpm build
   ```

4. **Start development:**
   ```bash
   cd apps/app
   pnpm start:dev
   ```

## Development (Contributing to CLI)

If you want to contribute to the CLI itself:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ixoworld/ixo-oracles-cli
   cd ixo-oracles-cli
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Build the CLI:**

   ```bash
   pnpm build
   ```

4. **Run locally:**
   ```bash
   pnpm start
   ```

**Development Scripts:**

- `pnpm build` - Build the CLI
- `pnpm dev` - Watch mode for development
- `pnpm test` - Run tests
- `pnpm lint` - Lint code
- `pnpm type-check` - Type check

## Support

For issues and questions:

- Create an issue in the repository
- Join the IXO Discord community
- Check the IXO documentation

## License

ISC
