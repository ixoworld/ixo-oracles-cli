import * as p from '@clack/prompts';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { Command } from '.';
import { CLIResult } from '../types';
import { renderAssistantMessage, renderDone, renderError, renderToolCall, renderWelcome } from '../utils/chat-renderer';
import { checkIsEntityDid, checkRequiredURL } from '../utils/common';
import { ensureMatrixRoom } from '../utils/matrix-room-setup';
import {
  checkHealth,
  createSession,
  deleteSession,
  getOpenIdToken,
  OpenIdToken,
  sendStreamingMessage,
} from '../utils/oracle-api';
import { loadOracleConfig } from '../utils/oracle-config';
import { RuntimeConfig } from '../utils/runtime-config';
import { parseSSEStream } from '../utils/sse-parser';
import { Wallet } from '../utils/wallet';

export class ChatCommand implements Command {
  name = 'chat';
  description = 'Chat with your oracle';
  interactive = true;

  private openIdToken: OpenIdToken | undefined;
  private openIdTokenExpiresAt = 0;
  private abortController: AbortController | undefined;

  constructor(private wallet: Wallet, private config: RuntimeConfig) {}

  private async ensureOpenIdToken(): Promise<string> {
    const now = Date.now();
    // Refresh if token is missing or expires within 30 seconds
    if (!this.openIdToken || now >= this.openIdTokenExpiresAt - 30_000) {
      const matrix = this.wallet.matrix;
      if (!matrix?.userId || !matrix.accessToken) {
        throw new Error('Matrix credentials not found. Please log in first.');
      }

      const homeserverUrl = this.wallet.matrixHomeServer;
      if (!homeserverUrl) {
        throw new Error('Cannot determine Matrix homeserver URL from wallet.');
      }

      this.openIdToken = await getOpenIdToken(homeserverUrl, matrix.userId, matrix.accessToken);
      this.openIdTokenExpiresAt = now + this.openIdToken.expires_in * 1000;
    }

    return this.openIdToken.access_token;
  }

  async execute(): Promise<CLIResult> {
    // 1. Try to load oracle.config.json for oracle info
    const oracleConfig = loadOracleConfig();

    let apiUrl: string;
    let oracleName = 'Oracle';
    let orgName = '';
    let description = '';
    let oracleEntityDid = oracleConfig?.entityDid;

    if (oracleConfig) {
      apiUrl = oracleConfig.apiUrl;
      oracleName = oracleConfig.oracleName || 'Oracle';
      orgName = oracleConfig.orgName || '';
      description = oracleConfig.description || '';
    } else {
      const urlInput = await p.text({
        message: 'Oracle API URL:',
        initialValue: 'http://localhost:3000',
        validate: (value) => checkRequiredURL(value),
      });

      if (p.isCancel(urlInput)) {
        p.cancel('Operation cancelled.');
        return { success: false, error: 'Cancelled' };
      }

      apiUrl = urlInput as string;

      const oracleEntityDidInput = await p.text({
        message: 'Oracle Entity Did:',
        initialValue: 'did:ixo:entity:bc0f10e6f77ec9281ea64020ee085864',
        validate: (value) => checkIsEntityDid(value),
      });

      if (p.isCancel(oracleEntityDidInput)) {
        p.cancel('Operation cancelled.');
        return { success: false, error: 'Cancelled' };
      }

      oracleEntityDid = oracleEntityDidInput;
    }

    // 2. Health check
    const healthy = await checkHealth(apiUrl);
    if (!healthy) {
      renderError(`Cannot reach oracle at ${apiUrl}. Is it running?`);
      return { success: false, error: `Oracle not reachable at ${apiUrl}` };
    }

    // 3. Ensure Matrix room exists (mirrors client SDK contracting logic)
    const userDid = this.wallet.did;
    const matrixAccessToken = this.wallet.matrix?.accessToken;
    const network = this.config.getValue('network') as NETWORK | undefined;

    if (!userDid || !matrixAccessToken || !network || !oracleEntityDid) {
      const missing = Object.entries({ userDid, matrixAccessToken, network, oracleEntityDid })
        .filter(([, v]) => !v)
        .map(([k]) => k);
      renderError(`Missing required values: ${missing.join(', ')}`);
      return { success: false, error: `Missing required values: ${missing.join(', ')}` };
    }

    try {
      await ensureMatrixRoom({
        userDid,
        oracleEntityDid,
        matrixAccessToken,
        network,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderError(`Matrix room setup failed: ${msg}`);
      return { success: false, error: msg };
    }

    // 4. Get OpenID token
    let token: string;
    try {
      token = await this.ensureOpenIdToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderError(`Authentication failed: ${msg}`);
      return { success: false, error: msg };
    }

    // 5. Create session
    let sessionId: string;
    try {
      const session = await createSession(apiUrl, token);
      sessionId = session.sessionId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderError(`Failed to create session: ${msg}`);
      return { success: false, error: msg };
    }

    // 6. Welcome message
    renderWelcome(oracleName, orgName, description, sessionId);

    // 7. REPL loop
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const input = await p.text({
          message: `${oracleName} >`,
        });

        if (p.isCancel(input)) {
          break;
        }

        const message = (input as string).trim();
        if (!message) continue;
        if (message.toLowerCase() === 'exit') break;

        // Refresh token if needed
        try {
          token = await this.ensureOpenIdToken();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          renderError(`Token refresh failed: ${msg}`);
          continue;
        }

        try {
          this.abortController = new AbortController();
          const stream = await sendStreamingMessage(apiUrl, sessionId, message, token, this.abortController.signal);

          for await (const event of parseSSEStream(stream)) {
            switch (event.event) {
              case 'message':
              case 'on_chat_model_stream': {
                const data = event.data;
                const content = typeof data === 'string' ? data : (data?.content ?? data?.text);
                if (content) {
                  renderAssistantMessage(String(content));
                }
                break;
              }
              case 'on_tool_start': {
                const data = event.data as Record<string, unknown>;
                const name = (data?.name ?? data?.tool ?? 'unknown') as string;
                const args =
                  typeof data?.args === 'string'
                    ? data.args
                    : JSON.stringify(data?.args ?? data?.input ?? {});
                renderToolCall(name, args);
                break;
              }
              case 'error': {
                const msg =
                  typeof event.data === 'string' ? event.data : ((event.data as Record<string, unknown>)?.message as string) ?? JSON.stringify(event.data);
                renderError(msg);
                break;
              }
              case 'end':
              case 'done': {
                break;
              }
              default: {
                // Render unknown text events as assistant messages
                if (typeof event.data === 'string') {
                  renderAssistantMessage(event.data);
                }
                break;
              }
            }
          }

          renderDone();
        } catch (err) {
          // Ensure partial output gets a newline before the error
          process.stdout.write('\n');
          const msg = err instanceof Error ? err.message : String(err);
          renderError(msg);
        } finally {
          this.abortController = undefined;
        }
      }
    } finally {
      // 8. Cleanup: abort any in-flight stream and delete session
      this.abortController?.abort();
      try {
        // Refresh token for cleanup if possible
        try {
          token = await this.ensureOpenIdToken();
        } catch {
          // Use last known token
        }
        await deleteSession(apiUrl, sessionId, token);
      } catch {
        // Best-effort cleanup
      }
    }

    p.log.info('Goodbye!');
    return { success: true };
  }
}
