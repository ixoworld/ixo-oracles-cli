import { createMatrixApiClient, utils as mxUtils } from '@ixo/matrixclient-sdk';
import { UploadContentType } from '@ixo/matrixclient-sdk/types/api/media/v1beta1';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { MatrixHomeServerUrl } from '../common';
import { createCIDFromBase64, jsonToBase64 } from '../createCIDFromBase64';
import { RuntimeConfig } from '../runtime-config';
import { Wallet } from '../wallet';

export const publicUpload = async ({
  data,
  fileName,
  config,
  wallet,
}: {
  data: object;
  fileName: string;
  config: RuntimeConfig;
  wallet: Wallet;
}) => {
  const matrixAPIClient = createMatrixApiClient({
    homeServerUrl: MatrixHomeServerUrl[(config.getValue('network') as NETWORK) ?? 'devnet'],
    accessToken: wallet?.matrix?.accessToken ?? '',
  });

  // Create a simple Buffer instead of using File - this works reliably with node-fetch
  const fileContent = JSON.stringify(data);
  const fileBuffer = Buffer.from(fileContent, 'utf8');
  const fullFileName = fileName + '.json';
  const contentType = 'application/ld+json';

  // Pass the buffer directly - node-fetch can handle this reliably in all environments
  const response = await matrixAPIClient.media.v1beta1.upload(
    fullFileName,
    contentType as UploadContentType,
    fileBuffer
  );
  const httpUrl = mxUtils.mxc.mxcUrlToHttp(
    MatrixHomeServerUrl[(config.getValue('network') as NETWORK) ?? 'devnet'], // homeServerUrl
    response.content_uri // the mxc url
  );

  if (!httpUrl) {
    throw new Error('Failed to upload file to Matrix');
  }

  const jsonString = JSON.stringify(data);
  const base64String = jsonToBase64(jsonString);
  const cid = await createCIDFromBase64(base64String);

  return {
    encrypted: 'false',
    cid,
    proof: cid,
    serviceEndpoint: httpUrl,
    mxc: response.content_uri,
  };
};
