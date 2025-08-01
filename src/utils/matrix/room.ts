import { createMatrixRoomBotClient, createMatrixStateBotClient } from '@ixo/matrixclient-sdk';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { MatrixBotHomeServerUrl, MatrixHomeServerUrl, MatrixRoomBotServerUrl } from '../common';
import { RuntimeConfig } from '../runtime-config';
import { Wallet } from '../wallet';

export class Room {
  public matrixRoomClient: ReturnType<typeof createMatrixRoomBotClient>;
  private matrixClient: ReturnType<typeof createMatrixStateBotClient>;

  constructor(private readonly config: RuntimeConfig, private readonly wallet: Wallet) {
    this.matrixRoomClient = createMatrixRoomBotClient({
      homeServerUrl: MatrixHomeServerUrl[(this.config.getValue('network') as NETWORK) ?? 'devnet'],
      accessToken: wallet?.matrix?.accessToken ?? '',
      botUrl: MatrixRoomBotServerUrl[(this.config.getValue('network') as NETWORK) ?? 'devnet'],
    });
    this.matrixClient = createMatrixStateBotClient({
      botUrl: MatrixBotHomeServerUrl[(this.config.getValue('network') as NETWORK) ?? 'devnet'],
      accessToken: this.wallet?.matrix?.accessToken ?? '',
    });
  }

  async sourceRoomAndJoin(did: string): Promise<string> {
    const sourceRoomResponse = await this.matrixRoomClient.room.v1beta1.sourceRoomAndJoin(did);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await this.matrixClient.bot.v1beta1.invite(sourceRoomResponse.roomId);
    return sourceRoomResponse.roomId;
  }
}
