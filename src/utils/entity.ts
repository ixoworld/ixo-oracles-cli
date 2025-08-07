import { isCancel, log, spinner, text } from '@clack/prompts';
import { customMessages, ixo, utils } from '@ixo/impactxclient-sdk';
import { LinkedResource, Service } from '@ixo/impactxclient-sdk/types/codegen/ixo/iid/v1beta1/types';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { registerUserSimplified } from './account/simplifiedRegistration';
import { checkRequiredString, RELAYER_NODE_DID } from './common';
import { publicUpload } from './matrix/upload-to-matrix';
import { RuntimeConfig } from './runtime-config';
import { Wallet } from './wallet';

interface BlockNoteBlock {
  id: string;
  type: string;
  props: {
    textColor: string;
    backgroundColor: string;
    textAlignment: string;
    level?: number;
  };
  content: Array<{
    type: string;
    text: string;
    styles: Record<string, any>;
  }>;
  children?: any[];
}
interface BlockNotePage {
  title: string;
  blocks: BlockNoteBlock[] | null;
}

interface CreateEntityParams {
  profile: {
    orgName: string;
    name: string;
    logo: string;
    coverImage: string;
    location: string;
    description: string;
  };
  page: {
    title: string;
    content: string;
  };
  services: Service[];
  parentProtocol: string;
  oracleConfig: {
    oracleName: string;
    price: number;
  };
}

export class CreateEntity {
  private readonly wallet: Wallet;
  constructor(wallet: Wallet, private config: RuntimeConfig) {
    if (!wallet.did || !wallet.pubKey || !wallet.address || !wallet.algo) {
      throw new Error('Wallet not found');
    }
    this.wallet = wallet;
    this.MsgCreateEntityParams.value.verification = [
      ...customMessages.iid.createIidVerificationMethods({
        did: wallet.did,
        pubkey: new Uint8Array(Buffer.from(wallet.pubKey)),
        address: wallet.address,
        controller: wallet.did,
        type: wallet.algo === 'ed25519' ? 'ed' : 'secp',
      }),
    ];

    this.MsgCreateEntityParams.value.context = [];
    this.MsgCreateEntityParams.value.controller = [wallet.did];
    this.MsgCreateEntityParams.value.ownerAddress = wallet.address;
    this.MsgCreateEntityParams.value.ownerDid = wallet.did;
    this.MsgCreateEntityParams.value.service.push(
      ixo.iid.v1beta1.Service.fromPartial({
        id: '{id}#matrix',
        type: 'Matrix',
        serviceEndpoint: 'devmx.ixo.earth',
      })
    );

    this.MsgCreateEntityParams.value.relayerNode =
      RELAYER_NODE_DID[(this.config.getValue('network') as NETWORK) ?? 'devnet'];
  }
  private MsgCreateEntityParams = {
    typeUrl: '/ixo.entity.v1beta1.MsgCreateEntity',
    value: ixo.entity.v1beta1.MsgCreateEntity.fromPartial({
      entityType: 'oracle',
      context: [],
      entityStatus: 0,
      verification: [],
      controller: [],
      ownerAddress: '',
      ownerDid: '',
      relayerNode: '',
      service: [],
      linkedResource: [],
      accordedRight: [],
      linkedEntity: [],
      linkedClaim: [],
      startDate: utils.proto.toTimestamp(new Date()),
      endDate: utils.proto.toTimestamp(new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)),
    }),
  };

  private async createAuthZConfig({
    oracleAccountAddress,
    oracleName,
    entityDid,
  }: {
    oracleAccountAddress: string;
    oracleName: string;
    entityDid: string;
  }): Promise<LinkedResource> {
    const config = {
      '@context': [
        'https://schema.org',
        {
          ixo: 'https://w3id.org/ixo/context/v1',
          oracle: {
            '@id': entityDid,
            '@type': '@id',
          },
        },
      ],
      '@type': 'Service',
      '@id': 'oracle:OracleAuthorization',
      name: 'OracleAuthorization',
      description: 'OracleAuthorization',
      serviceType: 'OracleClaimAuthorizationService',
      requiredPermissions: ['/ixo.claims.v1beta1.MsgCreateClaimAuthorization'],
      granteeAddress: oracleAccountAddress,
      granterAddress: '',
      oracleName: oracleName,
    };
    const response = await publicUpload({
      data: config,
      fileName: 'authz',
      config: this.config,
      wallet: this.wallet,
    });

    return ixo.iid.v1beta1.LinkedResource.fromPartial({
      id: '{id}#orz',
      type: 'oracleAuthZConfig',
      proof: response.proof,
      right: '',
      encrypted: 'false',
      mediaType: 'application/json',
      description: 'Orale AuthZ Config',
      serviceEndpoint: response.serviceEndpoint,
    });
  }

  /**
   * Create Fees Config
   * @param entityDid
   * @param price
   *
   * The fees config is used to set the pricing for the oracle -- this config is fetched by the Frontend and any client to use the pricing for the oracle and grant max amount permissions
   */
  private async createFeesConfig({ entityDid, price }: { entityDid: string; price: number }): Promise<LinkedResource> {
    const config = {
      '@context': [
        'https://schema.org',
        {
          ixo: 'https://w3id.org/ixo/context/v1',
          oracle: {
            '@id': entityDid,
            '@type': '@id',
          },
        },
      ],
      '@type': 'Service',
      '@id': 'oracle:ServiceFeeModel',
      name: 'Pricing',
      description: 'Pricing',
      serviceType: '',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'uixo',
        priceSpecification: {
          '@type': 'PaymentChargeSpecification',
          priceCurrency: 'uixo',
          price: price,
          unitCode: 'MON',
          billingIncrement: 1,
          billingPeriod: 'P1M',
          priceType: 'Subscription',
          maxPrice: price,
        },
        eligibleQuantity: {
          '@type': 'QuantitativeValue',
          value: 1,
          unitCode: 'MON',
        },
      },
    };
    const response = await publicUpload({
      data: config,
      fileName: 'fees',
      config: this.config,
      wallet: this.wallet,
    });
    return ixo.iid.v1beta1.LinkedResource.fromPartial({
      id: '{id}#fee',
      type: 'pricingList',
      proof: response.proof,
      right: '',
      encrypted: 'false',
      mediaType: 'application/json',
      description: 'Pricing List',
      serviceEndpoint: response.serviceEndpoint,
    });
  }

  /**
   * Create Oracle Config Files
   * @param oracleAccountAddress
   * @param oracleName
   * @param entityDid
   * @param price
   *
   * Using this after the entity is created to upload the config files to the entity using it's did
   * this will do entity update to add the config files to the entity
   */
  private async createOracleConfigFiles({
    oracleName,
    entityDid,
    price,
    oracleAccountAddress,
  }: CreateEntityParams['oracleConfig'] & { entityDid: string; oracleAccountAddress: string }) {
    const walletAddress = this.wallet.wallet?.address;

    if (!this.wallet.signXClient || !this.wallet.wallet || !walletAddress) {
      throw new Error('SignX client or wallet not found');
    }

    const resources = await Promise.all([
      this.createAuthZConfig({
        oracleName,
        entityDid,
        oracleAccountAddress,
      }),
      this.createFeesConfig({
        entityDid,
        price,
      }),
    ]);
    const linkedResourcesMsgs = resources.map((resource) => ({
      typeUrl: '/ixo.iid.v1beta1.MsgAddLinkedResource',
      value: ixo.iid.v1beta1.MsgAddLinkedResource.fromPartial({
        id: entityDid,
        linkedResource: ixo.iid.v1beta1.LinkedResource.fromPartial({
          id: resource.id,
          description: resource.description,
          type: resource.type,
          proof: resource.proof,
          mediaType: resource.mediaType,
          encrypted: resource.encrypted,
          serviceEndpoint: resource.serviceEndpoint,
        }),
        signer: walletAddress,
      }),
    }));

    // sign and send the msgs
    log.info('Sign to edit the entity and add the config files');
    const tx = await this.wallet.signXClient.transact(linkedResourcesMsgs, this.wallet.wallet);
    this.wallet.signXClient.displayTransactionQRCode(JSON.stringify(tx));
    await this.wallet.signXClient.pollNextTransaction();
    const response = await this.wallet.signXClient.awaitTransaction();
    return response;
  }

  private async addPage({ content, title }: CreateEntityParams['page']) {
    const blockNotePage: BlockNotePage = {
      title,
      blocks: [
        {
          id: 'title-block',
          type: 'heading',
          props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
          content: [{ type: 'text', text: title, styles: {} }],
        },
        {
          id: 'content-block',
          type: 'paragraph',
          props: {
            textColor: 'default',
            backgroundColor: 'default',
            textAlignment: 'left',
          },
          content: [{ type: 'text', text: content, styles: {} }],
        },
      ],
    };

    const response = await publicUpload({
      data: blockNotePage,
      fileName: 'page',
      config: this.config,
      wallet: this.wallet,
    });

    const pageResource = {
      id: '{id}#pag',
      type: 'Settings',
      description: 'Page',
      mediaType: 'application/json',
      serviceEndpoint: response.serviceEndpoint,
      proof: response.proof,
      encrypted: 'false',
      right: '',
    };
    this.MsgCreateEntityParams.value.linkedResource.push(ixo.iid.v1beta1.LinkedResource.fromPartial(pageResource));
  }

  private async addProfile({ orgName, name, logo, coverImage, location, description }: CreateEntityParams['profile']) {
    const profileData = {
      '@context': {
        ixo: 'https://w3id.org/ixo/ns/protocol/',
        '@id': '@type',
        type: '@type',
        '@protected': false,
      },
      id: 'ixo:entity#profile',
      type: 'profile',
      orgName,
      name,
      image: coverImage,
      logo,
      brand: orgName,
      location,
      description,
    };

    const response = await publicUpload({
      data: profileData,
      fileName: 'profile',
      config: this.config,
      wallet: this.wallet,
    });

    const profileResource = {
      id: '{id}#pro',
      type: 'Settings',
      description: 'Profile',
      mediaType: 'application/json',
      serviceEndpoint: response.serviceEndpoint,
      proof: response.proof,
      encrypted: 'false',
      right: '',
    };
    this.MsgCreateEntityParams.value.linkedResource.push(ixo.iid.v1beta1.LinkedResource.fromPartial(profileResource));
  }

  private async addServices(services: Service[]) {
    this.MsgCreateEntityParams.value.service.push(
      ...services.map((service) => ixo.iid.v1beta1.Service.fromPartial(service))
    );
  }

  private async setParentProtocol(parentProtocol: string) {
    this.MsgCreateEntityParams.value.context.push(
      ...customMessages.iid.createAgentIidContext([{ key: 'class', val: parentProtocol }])
    );
  }

  public returnExecutableMsg() {
    return this.MsgCreateEntityParams;
  }

  public async execute(params: CreateEntityParams): Promise<string> {
    log.info('Adding page');
    await this.addPage(params.page);
    log.info('Adding profile');
    await this.addProfile(params.profile);
    log.info('Adding services');
    await this.addServices(params.services);
    log.info('Adding parent protocol');
    await this.setParentProtocol(params.parentProtocol);

    const msg = this.returnExecutableMsg();
    if (!this.wallet.signXClient || !this.wallet.wallet) {
      throw new Error('SignX client not found');
    }
    log.info('Sign this transaction to create the entity');
    const tx = await this.wallet.signXClient.transact([msg], this.wallet.wallet);
    this.wallet.signXClient.displayTransactionQRCode(JSON.stringify(tx));
    await this.wallet.signXClient.pollNextTransaction();

    // Wait for transaction completion
    const response = await this.wallet.signXClient.awaitTransaction();
    log.success('Entity created -- wait to attach the required config files');

    log.info('Creating Oracle Wallet and Matrix Account');
    const pin = await text({
      message: 'Enter a PIN to secure your Matrix Vault:',
      initialValue: '',
      defaultValue: '',
      validate(value) {
        return checkRequiredString(value, 'PIN is required');
      },
    });
    if (isCancel(pin)) {
      log.error('User cancelled');
      process.exit(1);
    }
    const registerResult = await registerUserSimplified(
      {
        pin,
        oracleName: params.oracleConfig.oracleName,
        network: this.config.getValue('network') as NETWORK,
        oracleAvatarUrl: params.profile.logo,
      },
      async (address) => {
        await this.wallet.sendTokens(address, 250_000); // 250,000 uixo = 0.25 IXO;
      }
    );

    // upload resources
    const did = utils.common.getValueFromEvents(response as any, 'wasm', 'token_id');
    await this.createOracleConfigFiles({
      oracleName: params.oracleConfig.oracleName,
      price: params.oracleConfig.price,
      oracleAccountAddress: registerResult.address,
      entityDid: did,
    });
    log.success('Entity created -- config files attached');
    const s = spinner();
    s.start('Creating Entity Matrix Room...');
    s.stop('Room created -- room joined');
    log.warn('Please save the following information in a secure location as it is not stored:');
    log.info(`ORACLE ACCOUNT DETAILS`);
    log.info(`Oracle DID: ${registerResult.did}`);
    log.info(`Oracle Account Address: ${registerResult.address}`);
    log.info(`Oracle Account Mnemonic: ${registerResult.mnemonic}`);
    log.info(`Matrix User ID: ${registerResult.matrixUserId}`);
    log.info(`Matrix Password: ${registerResult.matrixPassword}`);
    this.config.addValue('registerUserResult', registerResult);
    this.config.addValue('entityDid', did);
    return did;
  }
}
