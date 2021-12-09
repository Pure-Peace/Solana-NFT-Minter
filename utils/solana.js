const web3 = require('@solana/web3.js')
const splToken = require('@solana/spl-token')
const anchor = require('@project-serum/anchor')

const { readJsonToObject } = require('./common')

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
const createAnchorProgram = async (provider) => {
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
  const anchorProgram = await createAnchorProgram(provider)
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
 * @param {ReuseableOptions} options
 **/
const reuseInitializer = async (options) => {
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
    if (!provider) {
      if (!connection) connection = createConnection(cluster)
      const providerData = await createProvider(connection, privKey)
      payer = providerData.payer
      wallet = providerData.wallet
      provider = providerData.provider
    }
    anchorProgram = await createAnchorProgram(provider)
    return Object.assign(options, { anchorProgram, payer, wallet, provider })
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
  createAnchorProgram,
  readyCandy,
  readyMint,
  mintOne,
  readyAll,
  getPrivKey,
  tryCandyKey,
  tryGetRealCandyKeys,
  reuseInitializer,
}
