import fs from 'fs';
import path from 'path';
import { mxLogin } from './account/matrix';
import { MatrixHomeServerUrl } from './common';
import { RuntimeConfig } from './runtime-config';
export const createProjectEnvFile = async (config: RuntimeConfig) => {
  const freshMx = await mxLogin({
    homeServerUrl: MatrixHomeServerUrl[config.getOrThrow('network')],
    username: config.getOrThrow('registerUserResult').matrixUserId,
    password: config.getOrThrow('registerUserResult').matrixPassword,
    deviceName: config.getOrThrow('registerUserResult').matrixDeviceName,
  });
  const network = config.getOrThrow('network');
  const projectPath = config.getOrThrow('projectPath');
  const envFile = path.join(projectPath, 'apps', 'app', '.env');

  console.log('Creating .env file at:', envFile);
  console.log('Project path:', projectPath);

  // Ensure the directory exists
  const envDir = path.dirname(envFile);
  if (!fs.existsSync(envDir)) {
    console.log('Creating directory:', envDir);
    fs.mkdirSync(envDir, { recursive: true });
  }
  const envContent = `
PORT=4000 
ORACLE_NAME=${config.getValue('projectName')}

# Matrix
MATRIX_BASE_URL=${MatrixHomeServerUrl[network]}
MATRIX_ORACLE_ADMIN_ACCESS_TOKEN=${freshMx.accessToken}
MATRIX_ORACLE_ADMIN_PASSWORD=${config.getOrThrow('registerUserResult').matrixPassword}
MATRIX_ORACLE_ADMIN_USER_ID=${config.getOrThrow('registerUserResult').matrixUserId}
MATRIX_RECOVERY_PHRASE=${config.getOrThrow('registerUserResult').matrixRecoveryPhrase}

# OPENAI
OPENAI_API_KEY=

# Langfuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

OPEN_ROUTER_API_KEY="sk-"


### NOT REQUIRED FOR THE APP BUT SAVE THEM IN SAFE PLACE
# ORACLE ACCOUNT DETAILS
ORACLE_ADDRESS=${config.getOrThrow('registerUserResult').address}
ORACLE_DID=${config.getOrThrow('registerUserResult').did}
ORACLE_MNEMONIC=${config.getOrThrow('registerUserResult').mnemonic}
MATRIX_VAULT_PIN=${config.getOrThrow('registerUserResult').pin}
ENTITY_DID=${config.getOrThrow('entityDid')}
`;
  try {
    fs.writeFileSync(envFile, envContent);
    console.log('✅ .env file created successfully at:', envFile);
  } catch (error) {
    console.error('❌ Failed to create .env file:', error);
    throw error;
  }
};
