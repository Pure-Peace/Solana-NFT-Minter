const web3 = require('@solana/web3.js')
const splToken = require('@solana/spl-token')
const anchor = require('@project-serum/anchor')
const prompts = require('prompts')
const fs = require('fs')
const path = require('path')

const { readJsonToObject } = require('./common')
const {
  SOLANA_ACCOUNTS_DIR
} = require('../nft-minter-config.json')

/**
 * @typedef  {{
 *  anchorProgram?: anchor.Program<anchor.Idl>,
 *  provider?: anchor.Provider,
 *  wallet?: anchor.Wallet,
 *  payer?: web3.Keypair,
 *  connection?: web3.Connection,
 *  cluster?: web3.Cluster,
 *  privKey?: Uint8Array
 * }} ReuseableOptions
 *
 * @typedef {{
 *    config: web3.PublicKey,
 *    candyMachine: web3.PublicKey,
 *    candy: anchor.IdlTypes<anchor.Idl>
 * }} CandyData
 *
 * @typedef {{
 *  anchorProgram: anchor.Program<anchor.Idl>,
 *  wallet: anchor.Wallet,
 *  provider: anchor.Provider,
 *  candyData: CandyData
 * }} ReadyData
 *
 * @typedef {{
 *  tryCandyData: { key: string, candyData: CandyData },
 *  connection: web3.Connection,
 *  provider: anchor.Provider,
 *  anchorProgram: anchor.Program<anchor.Idl>,
 *  wallet: anchor.Wallet,
 *  payer: web3.Keypair,
 *  candyConfig: {
 *   CANDY_MACHINE_PROGRAM_UUID: string,
 *   CANDY_MACHINE_PROGRAM_CONFIG: string,
 *   CONNECTION_NETWORK: string,
 * }
 * }} GetRealCandyKeysResult
 *
 * @typedef {{
 *  maxNumberOfLines: anchor.BN;
 *  symbol: string;
 *  sellerFeeBasisPoints: number;
 *  isMutable: boolean;
 *  maxSupply: anchor.BN;
 *  retainAuthority: boolean;
 *  creators: {
 *    address: PublicKey;
 *    verified: boolean;
 *    share: number;
 *  }[];
 * }} ConfigData
 **/

const CANDY_MACHINE = 'candy_machine'
const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new web3.PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
)
const CANDY_MACHINE_PROGRAM_ID = new web3.PublicKey(
  'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ',
)
const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

const CONFIG_ARRAY_START =
  32 + // authority
  4 +
  6 + // uuid + u32 len
  4 +
  10 + // u32 len + symbol
  2 + // seller fee basis points
  1 +
  4 +
  5 * 34 + // optional + u32 len + actual vec
  8 + //max supply
  1 + //is mutable
  1 + // retain authority
  4 // max number of lines;
const CONFIG_LINE_SIZE = 4 + 32 + 4 + 200

/**
 * There are 1-billion lamports in one SOL
 */
const LAMPORTS_PER_SOL = 1000000000

/**
 * @param {web3.PublicKey} wallet
 * @param {web3.PublicKey} mint
 * @return {Promise<web3.PublicKey>}
 **/
const getTokenWallet = async function (wallet, mint) {
  return (
    await web3.PublicKey.findProgramAddress(
      [
        wallet.toBuffer(),
        splToken.TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    )
  )[0]
}

/**
 * @param {web3.PublicKey} config
 * @param {string} uuid
 * @return {Promise<[web3.PublicKey, number]>}
 **/
const getCandyMachine = async (config, uuid) => {
  return await web3.PublicKey.findProgramAddress(
    [Buffer.from(CANDY_MACHINE), config.toBuffer(), Buffer.from(uuid)],
    CANDY_MACHINE_PROGRAM_ID,
  )
}

/**
 * @param {web3.PublicKey} mint
 * @return {Promise<web3.PublicKey>}
 **/
const getMetadata = async (mint) => {
  return (
    await web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0]
}

/**
 * @param {web3.PublicKey} mint
 * @return {Promise<web3.PublicKey>}
 **/
const getMasterEdition = async (mint) => {
  return (
    await web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0]
}

/**
 * @param {web3.PublicKey} associatedTokenAddress
 * @param {web3.PublicKey} payer
 * @param {web3.PublicKey} walletAddress
 * @param {web3.PublicKey} splTokenMintAddress
 * @return {web3.TransactionInstruction}
 **/
const createAssociatedTokenAccountInstruction = (
  associatedTokenAddress,
  payer,
  walletAddress,
  splTokenMintAddress,
) => {
  const keys = [
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: associatedTokenAddress,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: walletAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: splTokenMintAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: splToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: web3.SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ]
  return new web3.TransactionInstruction({
    keys,
    programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    data: Buffer.from([]),
  })
}

/**
 * @param {web3.Cluster} cluster
 **/
const createConnection = (cluster) => {
  return new web3.Connection(web3.clusterApiUrl(cluster), 'confirmed')
}

/**
 * @param {web3.Connection} connection
 * @param {Uint8Array} privKey
 **/
const createProvider = async (connection, privKey) => {
  const payer = web3.Keypair.fromSecretKey(privKey)
  const wallet = new anchor.Wallet(payer)

  const provider = new anchor.Provider(connection, wallet, {
    preflightCommitment: 'recent',
  })
  return {
    payer,
    wallet,
    provider,
  }
}

/**
 * @param {anchor.Provider} provider
 **/
const createCandyAnchorProgram = async (provider) => {
  const idl = await anchor.Program.fetchIdl(CANDY_MACHINE_PROGRAM_ID, provider)
  return new anchor.Program(idl, CANDY_MACHINE_PROGRAM_ID, provider)
}

/**
 * @param {anchor.Program<anchor.Idl>} anchorProgram
 * @param {string} candyProgramConfig
 **/
const readyCandy = async (anchorProgram, candyProgramConfig) => {
  const config = new web3.PublicKey(candyProgramConfig)
  const [candyMachine] = await getCandyMachine(
    config,
    candyProgramConfig.slice(0, 6),
  )
  const candy = await anchorProgram.account.candyMachine.fetch(candyMachine)
  return {
    config,
    candyMachine,
    candy,
  }
}

/**
 * @param {anchor.Wallet} wallet
 **/
const readyMint = async (wallet) => {
  const mint = web3.Keypair.generate()
  const token = await getTokenWallet(wallet.publicKey, mint.publicKey)

  const metadata = await getMetadata(mint.publicKey)
  const masterEdition = await getMasterEdition(mint.publicKey)

  return {
    mint,
    token,
    metadata,
    masterEdition,
  }
}

/**
 * @param {{ CANDY_MACHINE_PROGRAM_CONFIG: string, CONNECTION_NETWORK: string, PRIV_KEY: Uint8Array }}
 **/
const readyAll = async ({
  CANDY_MACHINE_PROGRAM_CONFIG,
  CONNECTION_NETWORK,
  PRIV_KEY,
}) => {
  const connection = createConnection(CONNECTION_NETWORK)
  const { wallet, provider } = await createProvider(connection, PRIV_KEY)
  const anchorProgram = await createCandyAnchorProgram(provider)
  const candyData = await readyCandy(
    anchorProgram,
    CANDY_MACHINE_PROGRAM_CONFIG,
  )
  return {
    connection,
    wallet,
    provider,
    anchorProgram,
    candyData,
  }
}

/**
 * @param {ReadyData} readyData
 **/
const mintOne = async (readyData) => {
  const {
    anchorProgram,
    wallet,
    provider,
    candyData: { config, candyMachine, candy },
  } = readyData
  const { mint, token, metadata, masterEdition } = await readyMint(wallet)
  const tx = await anchorProgram.rpc.mintNft({
    accounts: {
      config: config,
      candyMachine: candyMachine,
      payer: wallet.publicKey,
      wallet: candy.wallet,
      mint: mint.publicKey,
      metadata,
      masterEdition,
      mintAuthority: wallet.publicKey,
      updateAuthority: wallet.publicKey,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
      clock: web3.SYSVAR_CLOCK_PUBKEY,
    },
    signers: [mint],
    instructions: [
      web3.SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        space: splToken.MintLayout.span,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          splToken.MintLayout.span,
        ),
        programId: splToken.TOKEN_PROGRAM_ID,
      }),
      splToken.Token.createInitMintInstruction(
        splToken.TOKEN_PROGRAM_ID,
        mint.publicKey,
        0,
        wallet.publicKey,
        wallet.publicKey,
      ),
      createAssociatedTokenAccountInstruction(
        token,
        wallet.publicKey,
        wallet.publicKey,
        mint.publicKey,
      ),
      splToken.Token.createMintToInstruction(
        splToken.TOKEN_PROGRAM_ID,
        mint.publicKey,
        token,
        wallet.publicKey,
        [],
        1,
      ),
    ],
  })

  console.log('>>> MINT TX: ', tx)
  return tx
}

/**
 * @param {string} path
 **/
const getPrivKey = (path) => {
  return new Uint8Array(readJsonToObject(path))
}

/**
 * @param {anchor.Program<anchor.Idl>} anchorProgram
 * @param {string} key
 * @returns {Promise<{ key: string, candyData: CandyData}>}
 **/
const tryCandyKey = (anchorProgram, key) => {
  return new Promise(async (resolve, reject) => {
    try {
      const candyData = await readyCandy(anchorProgram, key)
      return resolve({ key, candyData })
    } catch (_err) {
      return reject()
    }
  })
}

/**
 * @param {boolean?} doneExitOnCancel
 * @returns {Promise<Uint8Array>}
 **/
const selectPrivKey = async (doneExitOnCancel) => {
  const { privKey } = await prompts(
    {
      type: 'select',
      name: 'privKey',
      message: 'Select an privKey file:',
      choices: fs.readdirSync(SOLANA_ACCOUNTS_DIR).map((f) => {
        return {
          title: f,
          value: new Uint8Array(readJsonToObject(path.join(SOLANA_ACCOUNTS_DIR, f))),
        }
      }),
      initial: 0,
    },
    {
      onCancel: !doneExitOnCancel && (() => process.exit(0)),
    },
  )
  return privKey
}

/**
 * @param {boolean?} doneExitOnCancel
 * @returns {Promise<string>}
 **/
const selectCluster = async (doneExitOnCancel) => {
  const { cluster } = await prompts(
    {
      type: 'select',
      name: 'cluster',
      message: 'Select solana cluster type:',
      choices: ['mainnet-beta', 'testnet', 'devnet'].map((v) => {
        return { title: v, value: v }
      }),
      initial: 0,
    },
    {
      onCancel: !doneExitOnCancel && (() => process.exit(0)),
    },
  )
  return cluster
}


/**
 * @param {ReuseableOptions} options
 **/
const reuseInitializer = async (options = {}) => {
  if (!options.anchorProgram) {
    console.log('\n >> Initializing Solana program...\n')
    let {
      connection,
      anchorProgram,
      provider,
      wallet,
      payer,
      cluster,
      privKey,
    } = options
    if (anchorProgram) return options
    if (!provider) {
      if (!connection) {
        if (!cluster) cluster = await selectCluster()
        connection = createConnection(cluster)
      }
      if (!privKey) {
        privKey = await selectPrivKey()
      }
      const providerData = await createProvider(connection, privKey)
      payer = providerData.payer
      wallet = providerData.wallet
      provider = providerData.provider
    }
    anchorProgram = await createCandyAnchorProgram(provider)
    return { anchorProgram, payer, wallet, provider, privKey, connection, cluster }
  } else {
    return options
  }
}

/**
 * @param {Array<string>} likeKeys
 * @param {ReuseableOptions} options
 * @returns {Promise<GetRealCandyKeysResult>}
 **/
const tryGetRealCandyKeys = async (likeKeys, options) => {
  const newOptions = await reuseInitializer(options)
  return {
    tryCandyData: await Promise.any(
      likeKeys.map((k) => tryCandyKey(newOptions.anchorProgram, k)),
    ),
    ...Object.assign(options, newOptions),
  }
}

/**
 * @param {web3.PublicKey} pubKey
 **/
function uuidFromPubkey(pubKey) {
  return pubKey.toBase58().slice(0, 6)
}

/**
 * @param {anchor.Program} anchorProgram
 * @param {ConfigData} configData
 * @param {web3.PublicKey} payerWallet
 * @param {web3.PublicKey} configAccount
 **/
async function createCandyConfigAccount(
  anchorProgram,
  configData,
  payerWallet,
  configAccount,
) {
  const size =
    CONFIG_ARRAY_START +
    4 +
    configData.maxNumberOfLines.toNumber() * CONFIG_LINE_SIZE +
    4 +
    Math.ceil(configData.maxNumberOfLines.toNumber() / 8)

  return anchor.web3.SystemProgram.createAccount({
    fromPubkey: payerWallet,
    newAccountPubkey: configAccount,
    space: size,
    lamports: await anchorProgram.provider.connection.getMinimumBalanceForRentExemption(
      size,
    ),
    programId: CANDY_MACHINE_PROGRAM_ID,
  })
}

/**
 * @param {anchor.Program} anchorProgram
 * @param {web3.Keypair} payerWallet
 * @param {ConfigData} configData
 **/
const createCandyConfig = async function (
  anchorProgram,
  payerWallet,
  configData,
) {
  const configAccount = web3.Keypair.generate()
  const uuid = uuidFromPubkey(configAccount.publicKey)

  if (!configData.creators || configData.creators.length === 0) {
    throw new Error(`Invalid config, there must be at least one creator.`)
  }

  const totalShare = (configData.creators || []).reduce(
    (acc, curr) => acc + curr.share,
    0,
  )

  if (totalShare !== 100) {
    throw new Error(`Invalid config, creators shares must add up to 100`)
  }

  return {
    config: configAccount.publicKey,
    uuid,
    txId: await anchorProgram.rpc.initializeConfig(
      {
        uuid,
        ...configData,
      },
      {
        accounts: {
          config: configAccount.publicKey,
          authority: payerWallet.publicKey,
          payer: payerWallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [payerWallet, configAccount],
        instructions: [
          await createCandyConfigAccount(
            anchorProgram,
            configData,
            payerWallet.publicKey,
            configAccount.publicKey,
          ),
        ],
      },
    ),
  }
}

/**
 * @param {string} address
 * @param {string} cluster
 **/
const explorerUrl = (address, cluster) => {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`
}


module.exports = {
  CANDY_MACHINE,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  CANDY_MACHINE_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  getTokenWallet,
  getCandyMachine,
  getMetadata,
  getMasterEdition,
  createAssociatedTokenAccountInstruction,
  createConnection,
  createProvider,
  createCandyAnchorProgram,
  readyCandy,
  readyMint,
  mintOne,
  readyAll,
  getPrivKey,
  tryCandyKey,
  tryGetRealCandyKeys,
  reuseInitializer,
  uuidFromPubkey,
  createCandyConfig,
  createCandyConfigAccount,
  explorerUrl,
  selectCluster,
  selectPrivKey,
  LAMPORTS_PER_SOL,
}
