import fs from "fs";
import path from "path";
import { NETWORK } from "@ixo/signx-sdk/types/types/transact";
import { mxLogin } from "./account/matrix";
import {
  BLOCKSYNC_GRAPHQL_URL,
  CHAIN_RPC,
  DOMAIN_INDEXER_URL,
  MatrixHomeServerUrl,
  MEMORY_ENGINE_API,
  MEMORY_ENGINE_MCP,
  SANDBOX_API,
  SUBSCRIPTION_API,
} from "./common";
import { RuntimeConfig } from "./runtime-config";

interface EnvValues {
  oracleName: string;
  network: NETWORK;
  matrixBaseUrl: string;
  matrixAccessToken: string;
  matrixPassword: string;
  matrixUserId: string;
  matrixRecoveryPhrase: string;
  matrixPin: string;
  matrixRoomId: string;
  mnemonic: string;
  entityDid: string;
  oracleAddress: string;
  oracleDid: string;
}

function buildEnvContent(net: NETWORK, values: EnvValues): string {
  return `
PORT=4000
ORACLE_NAME=${values.oracleName}

# Network
NETWORK=${net}
RPC_URL=${CHAIN_RPC[net]}
BLOCKSYNC_GRAPHQL_URL=${BLOCKSYNC_GRAPHQL_URL[net]}
BLOCKSYNC_URI=${BLOCKSYNC_GRAPHQL_URL[net]}

# Matrix
MATRIX_BASE_URL=${values.matrixBaseUrl}
MATRIX_ORACLE_ADMIN_ACCESS_TOKEN=${values.matrixAccessToken}
MATRIX_ORACLE_ADMIN_PASSWORD=${values.matrixPassword}
MATRIX_ORACLE_ADMIN_USER_ID=${values.matrixUserId}
MATRIX_RECOVERY_PHRASE="${values.matrixRecoveryPhrase}"
MATRIX_VALUE_PIN=${values.matrixPin}
MATRIX_ACCOUNT_ROOM_ID="${values.matrixRoomId}"

# Blockchain
SECP_MNEMONIC="${values.mnemonic}"
ORACLE_ENTITY_DID=${values.entityDid}

# Database
SQLITE_DATABASE_PATH=./sqlite-db
REDIS_URL=redis://localhost:6379

# LLM (add your API keys)
OPENAI_API_KEY=
OPEN_ROUTER_API_KEY=

# External Services (configure these for your deployment)
MEMORY_MCP_URL=${MEMORY_ENGINE_MCP[net]}
MEMORY_ENGINE_URL=${MEMORY_ENGINE_API[net]}

# FIRECRWAL -> check the docs https://docs.firecrawl.dev/mcp-server
FIRECRAWL_MCP_URL=
DOMAIN_INDEXER_URL=${DOMAIN_INDEXER_URL[net]}
SANDBOX_MCP_URL=${SANDBOX_API[net]}

# Observability (optional)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=
LANGSMITH_API_KEY=
LANGSMITH_PROJECT="${values.oracleName}_${net}"


DISABLE_CREDITS=true
CORS_ORIGIN=*
SUBSCRIPTION_URL=${SUBSCRIPTION_API[net]}

### BACKUP — save these securely (values above are already set)
# ORACLE_ADDRESS=${values.oracleAddress}
# ORACLE_DID=${values.oracleDid}
`;
}

function buildEnvContentForNetwork(net: NETWORK, oracleName: string): string {
  return `# To fill in the blank values, run: oracles-cli create-entity (select ${net})

PORT=4000
ORACLE_NAME=${oracleName}

# Network
NETWORK=${net}
RPC_URL=${CHAIN_RPC[net]}
BLOCKSYNC_GRAPHQL_URL=${BLOCKSYNC_GRAPHQL_URL[net]}
BLOCKSYNC_URI=${BLOCKSYNC_GRAPHQL_URL[net]}

# Matrix
MATRIX_BASE_URL=${MatrixHomeServerUrl[net]}
MATRIX_ORACLE_ADMIN_ACCESS_TOKEN=
MATRIX_ORACLE_ADMIN_PASSWORD=
MATRIX_ORACLE_ADMIN_USER_ID=
MATRIX_RECOVERY_PHRASE=
MATRIX_VALUE_PIN=
MATRIX_ACCOUNT_ROOM_ID=

# Blockchain
SECP_MNEMONIC=
ORACLE_ENTITY_DID=

# Database
SQLITE_DATABASE_PATH=./sqlite-db
REDIS_URL=redis://localhost:6379

# LLM (add your API keys)
OPENAI_API_KEY=
OPEN_ROUTER_API_KEY=

# External Services (configure these for your deployment)
MEMORY_MCP_URL=${MEMORY_ENGINE_MCP[net]}
MEMORY_ENGINE_URL=${MEMORY_ENGINE_API[net]}

# FIRECRWAL -> check the docs https://docs.firecrawl.dev/mcp-server
FIRECRAWL_MCP_URL=
DOMAIN_INDEXER_URL=${DOMAIN_INDEXER_URL[net]}
SANDBOX_MCP_URL=${SANDBOX_API[net]}

# Observability (optional)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=
LANGSMITH_API_KEY=
LANGSMITH_PROJECT="${oracleName}_${net}"


# Features (optional)
# DISABLE_CREDITS=false
# CORS_ORIGIN=*
# SUBSCRIPTION_URL=${SUBSCRIPTION_API[net]}
`;
}

function writeEnvFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content);
    console.log("✅ env file created successfully at:", filePath);
  } catch (error) {
    console.error("❌ Failed to create env file:", filePath, error);
    throw error;
  }
}

export const createProjectEnvFile = async (config: RuntimeConfig) => {
  const oracleMatrixHomeServerUrl = config.getOrThrow(
    "oracleMatrixHomeServerUrl",
  );
  const network = config.getOrThrow("network") as NETWORK;
  const regResult = config.getOrThrow("registerUserResult");

  const freshMx = await mxLogin({
    homeServerUrl: oracleMatrixHomeServerUrl,
    username: regResult.matrixUserId,
    password: regResult.matrixPassword,
    deviceName: regResult.matrixDeviceName,
  });
  const projectPath = config.getOrThrow("projectPath");
  const envDir = path.join(projectPath, "apps", "app");

  console.log("Creating env files in:", envDir);

  if (!fs.existsSync(envDir)) {
    console.log("Creating directory:", envDir);
    fs.mkdirSync(envDir, { recursive: true });
  }

  const oracleName = (config.getValue("projectName") as string) ?? "";

  // Write main .env with full values for the current network
  const envContent = buildEnvContent(network, {
    oracleName,
    network,
    matrixBaseUrl: oracleMatrixHomeServerUrl,
    matrixAccessToken: freshMx.accessToken,
    matrixPassword: regResult.matrixPassword,
    matrixUserId: regResult.matrixUserId,
    matrixRecoveryPhrase: regResult.matrixRecoveryPhrase,
    matrixPin: regResult.pin,
    matrixRoomId: regResult.matrixRoomId,
    mnemonic: regResult.mnemonic,
    entityDid: config.getOrThrow("entityDid"),
    oracleAddress: regResult.address,
    oracleDid: regResult.did,
  });
  // Write full values to network-specific file (e.g. .env.testnet)
  const networkFilename = `.env.${network}`;
  writeEnvFile(path.join(envDir, networkFilename), envContent);

  // Copy to .env (active config the app reads)
  writeEnvFile(path.join(envDir, ".env"), envContent);

  // Write blank templates for other networks only if they don't already exist
  const allNetworks: { net: NETWORK; filename: string }[] = [
    { net: "devnet", filename: ".env.devnet" },
    { net: "testnet", filename: ".env.testnet" },
    { net: "mainnet", filename: ".env.mainnet" },
  ];

  for (const { net, filename } of allNetworks) {
    if (net === network) continue;
    const filePath = path.join(envDir, filename);
    if (fs.existsSync(filePath)) continue;
    const content = buildEnvContentForNetwork(net, oracleName);
    writeEnvFile(filePath, content);
  }
};
