import { isCancel, log, spinner, text } from '@clack/prompts';
import { customMessages, ixo, utils } from '@ixo/impactxclient-sdk';
import { LinkedResource, Service } from '@ixo/impactxclient-sdk/types/codegen/ixo/iid/v1beta1/types';
import { NETWORK } from '@ixo/signx-sdk/types/types/transact';
import { registerUserSimplified, SimplifiedRegistrationResult } from './account/simplifiedRegistration';
import { checkRequiredString, DOMAIN_INDEXER_URL, RELAYER_NODE_DID } from './common';
import { publicUpload } from './matrix/upload-to-matrix';
import { RuntimeConfig } from './runtime-config';
import { Wallet } from './wallet';

interface CreateEntityParams {
  profile: {
    orgName: string;
    name: string;
    logo: string;
    coverImage: string;
    location: string;
    description: string;
  };
  services: Service[];
  parentProtocol: string;
  oracleConfig: {
    oracleName: string;
    price: number;
  };
}
type Denom = 'uixo' | 'ibc/6BBE9BD4246F8E04948D5A4EEE7164B2630263B9EBB5E7DC5F0A46C62A2FF97B';

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
  public addLinkedAccounts({ oracleAccountAddress }: { oracleAccountAddress: string }) {
    if (!this.wallet.signXClient || !this.wallet.wallet) {
      throw new Error('SignX client or wallet not found');
    }
    const memoryEngineByNetwork = {
      devnet: 'did:ixo:ixo17w9u5uk4qjyjgeyqfpnp92jwy58faey9vvp3ar',
      testnet: 'did:ixo:ixo14vjrckltpngugp03tcasfgh5qakey9n3sgm6y2',
      mainnet: 'did:ixo:ixo1d39eutxdc0e8mnp0fmzqjdy6aaf26s9hzrk33r',
    }[this.config.getValue('network') as NETWORK];

    const accounts = [memoryEngineByNetwork, `did:ixo:${oracleAccountAddress}`];
    const linkedAccounts = accounts.map((account) =>
      ixo.iid.v1beta1.LinkedEntity.fromPartial({
        id: account,
        type: 'agent',
        relationship: 'admin',
        service: 'matrix',
      })
    );

    this.MsgCreateEntityParams.value.linkedEntity = linkedAccounts;
  }
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
   * @param price -- in credits
   * @param denom -- the denom of the price
   *
   * The fees config is used to set the pricing for the oracle -- this config is fetched by the Frontend and any client to use the pricing for the oracle and grant max amount permissions
   */
  private async createFeesConfig({
    entityDid,
    price,
    denom,
  }: {
    entityDid: string;
    price: number;
    denom: Denom;
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
      '@id': 'oracle:ServiceFeeModel',
      name: 'Pricing',
      description: 'Pricing',
      serviceType: '',
      offers: {
        '@type': 'Offer',
        priceCurrency: denom,
        priceSpecification: {
          '@type': 'PaymentChargeSpecification',
          priceCurrency: denom,
          price: price * 1000, // 1 credit is 1000 uixo
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
  /**
   * Add a controller to an existing entity
   * @param entityDid - The DID of the entity to update
   * @param controllerDid - The DID of the controller to add
   */
  public async addControllerToEntity(entityDid: string, controllerDid: string): Promise<void> {
    const walletAddress = this.wallet.wallet?.address;

    if (!this.wallet.signXClient || !this.wallet.wallet || !walletAddress) {
      throw new Error('SignX client or wallet not found');
    }

    const addControllerMsg = {
      typeUrl: '/ixo.iid.v1beta1.MsgAddController',
      value: ixo.iid.v1beta1.MsgAddController.fromPartial({
        id: entityDid,
        controllerDid: controllerDid,
        signer: walletAddress,
      }),
    };

    log.info(`Sign to add controller ${controllerDid} to entity ${entityDid}`);
    const tx = await this.wallet.signXClient.transact([addControllerMsg], this.wallet.wallet);
    this.wallet.signXClient.displayTransactionQRCode(JSON.stringify(tx));
    await this.wallet.signXClient.pollNextTransaction();
    await this.wallet.signXClient.awaitTransaction();
    log.success(`Controller ${controllerDid} added to entity ${entityDid}`);
  }

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
        denom:
          this.config.getValue('network') === 'devnet'
            ? 'uixo'
            : 'ibc/6BBE9BD4246F8E04948D5A4EEE7164B2630263B9EBB5E7DC5F0A46C62A2FF97B',
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

  private async createDomainCard({
    profile,
    entityDid,
  }: {
    profile: CreateEntityParams['profile'];
    entityDid: string;
  }): Promise<LinkedResource> {
    const validFrom = new Date().toISOString();

    const domainCard = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/ixo/context/v1',
        {
          schema: 'https://schema.org/',
          ixo: 'https://w3id.org/ixo/vocab/v1',
          prov: 'http://www.w3.org/ns/prov#',
          proj: 'https://linked.data.gov.au/def/project#',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
          id: '@id',
          type: '@type',
          'ixo:vector': {
            '@container': '@list',
            '@type': 'xsd:double',
          },
          '@protected': true,
        },
      ],
      id: `${entityDid}#dmn`,
      type: ['VerifiableCredential', 'ixo:DomainCard'],
      issuer: {
        id: this.wallet.did,
      },
      validFrom: validFrom,
      credentialSchema: {
        id: 'https://github.com/ixoworld/domainCards/schemas/ixo-domain-card-1.json',
        type: 'JsonSchema',
      },
      credentialSubject: {
        id: entityDid,
        type: ['ixo:dao'],
        additionalType: ['schema:Organization'],
        name: profile.name,
        alternateName: profile.orgName !== profile.name ? [profile.orgName] : undefined,
        description: profile.description,
        logo: {
          type: 'schema:ImageObject',
          id: profile.logo,
          contentUrl: profile.logo,
        },
        image: [
          {
            type: 'schema:ImageObject',
            id: profile.coverImage,
            contentUrl: profile.coverImage,
          },
        ],
        address: {
          type: 'schema:PostalAddress',
          addressLocality: profile.location,
        },
      },
    };

    const response = await publicUpload({
      data: domainCard,
      fileName: 'domainCard',
      config: this.config,
      wallet: this.wallet,
    });

    return ixo.iid.v1beta1.LinkedResource.fromPartial({
      id: '{id}#dmn',
      type: 'domainCard',
      proof: response.proof,
      right: '',
      encrypted: 'false',
      mediaType: 'application/json',
      description: 'Domain Card',
      serviceEndpoint: response.serviceEndpoint,
    });
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

  private addServices(services: Service[]) {
    this.MsgCreateEntityParams.value.service.push(
      ...services.map((service) => ixo.iid.v1beta1.Service.fromPartial(service))
    );
  }

  private setParentProtocol(parentProtocol: string) {
    this.MsgCreateEntityParams.value.context.push(
      ...customMessages.iid.createAgentIidContext([{ key: 'class', val: parentProtocol }])
    );
  }

  public returnExecutableMsg() {
    return this.MsgCreateEntityParams;
  }

  private async submitToDomainIndexer(entityDid: string): Promise<void> {
    const network = (this.config.getValue('network') as NETWORK) ?? 'devnet';
    const indexerUrl = DOMAIN_INDEXER_URL[network];

    try {
      const response = await fetch(indexerUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          did: entityDid,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.warn(`Failed to submit to domain indexer: ${response.status} ${errorText}`);
        return;
      }

      log.success('Domain card submitted to domain indexer');
    } catch (error) {
      log.warn(`Error submitting to domain indexer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async execute(params: CreateEntityParams): Promise<string> {
    log.info('Adding profile');
    await this.addProfile(params.profile);
    log.info('Adding services');
    this.addServices(params.services);
    log.info('Adding parent protocol');
    this.setParentProtocol(params.parentProtocol);

    const msg = this.returnExecutableMsg();
    if (!this.wallet.signXClient || !this.wallet.wallet) {
      throw new Error('SignX client not found');
    }

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

    this.addLinkedAccounts({
      oracleAccountAddress: registerResult.address,
    });

    log.info('Sign this transaction to create the entity');
    const tx = await this.wallet.signXClient.transact([msg], this.wallet.wallet);
    this.wallet.signXClient.displayTransactionQRCode(JSON.stringify(tx));
    await this.wallet.signXClient.pollNextTransaction();

    // Wait for transaction completion
    const response = await this.wallet.signXClient.awaitTransaction();
    log.success('Entity created -- wait to attach the required config files');

    // upload resources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const did = utils.common.getValueFromEvents(response as any, 'wasm', 'token_id');

    // Create domain card
    log.info('Creating domain card');
    const domainCardResource = await this.createDomainCard({
      profile: params.profile,
      entityDid: did,
    });

    // Add domain card to entity
    if (this.wallet.wallet?.address) {
      const addDomainCardMsg = {
        typeUrl: '/ixo.iid.v1beta1.MsgAddLinkedResource',
        value: ixo.iid.v1beta1.MsgAddLinkedResource.fromPartial({
          id: did,
          linkedResource: ixo.iid.v1beta1.LinkedResource.fromPartial({
            id: domainCardResource.id,
            description: domainCardResource.description,
            type: domainCardResource.type,
            proof: domainCardResource.proof,
            mediaType: domainCardResource.mediaType,
            encrypted: domainCardResource.encrypted,
            serviceEndpoint: domainCardResource.serviceEndpoint,
          }),
          signer: this.wallet.wallet.address,
        }),
      };
      log.info('Sign to add domain card to the entity');
      const domainCardTx = await this.wallet.signXClient.transact([addDomainCardMsg], this.wallet.wallet);
      this.wallet.signXClient.displayTransactionQRCode(JSON.stringify(domainCardTx));
      await this.wallet.signXClient.pollNextTransaction();
      await this.wallet.signXClient.awaitTransaction();
      log.success('Domain card added to entity');
    }

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

    for (const key in registerResult) {
      log.info(`${key}: ${registerResult[key as keyof SimplifiedRegistrationResult]}`);
    }
    this.config.addValue('registerUserResult', registerResult);
    this.config.addValue('entityDid', did);

    // Submit to domain indexer
    log.info('Submitting domain card to domain indexer');
    await this.submitToDomainIndexer(did);

    return did;
  }
}
