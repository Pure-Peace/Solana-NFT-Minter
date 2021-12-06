const web3 = require('@solana/web3.js')
const splToken = require('@solana/spl-token')
const anchor = require('@project-serum/anchor')

const mintConfig = require('./config')

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

const PRIV_KEY = new Uint8Array([
  97,
  188,
  159,
  128,
  31,
  103,
  47,
  197,
  185,
  250,
  242,
  68,
  90,
  13,
  65,
  130,
  182,
  43,
  52,
  245,
  179,
  217,
  88,
  231,
  160,
  149,
  147,
  15,
  168,
  72,
  58,
  94,
  218,
  4,
  136,
  84,
  113,
  150,
  138,
  165,
  36,
  35,
  52,
  43,
  92,
  43,
  164,
  183,
  146,
  241,
  249,
  184,
  99,
  78,
  1,
  40,
  136,
  42,
  44,
  87,
  83,
  64,
  58,
  223,
])

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

async function mintOne() {
  // Connect to cluster
  const connection = new web3.Connection(
    web3.clusterApiUrl(mintConfig.CONNECTION_NETWORK),
    'confirmed',
  )

  const payer = web3.Keypair.fromSecretKey(PRIV_KEY)
  const wallet = new anchor.Wallet(payer)
  const mint = web3.Keypair.generate()
  const token = await getTokenWallet(wallet.publicKey, mint.publicKey)

  const provider = new anchor.Provider(connection, wallet, {
    preflightCommitment: 'recent',
  })
  const idl = await anchor.Program.fetchIdl(CANDY_MACHINE_PROGRAM_ID, provider)
  const anchorProgram = new anchor.Program(
    idl,
    CANDY_MACHINE_PROGRAM_ID,
    provider,
  )

  const config = new web3.PublicKey(
    mintConfig.CANDY_MACHINE_PROGRAM_CONFIG,
  )
  const [candyMachine] = await getCandyMachine(
    config,
    mintConfig.CANDY_MACHINE_PROGRAM_UUID,
  )

  const candy = await anchorProgram.account.candyMachine.fetch(candyMachine)
  const metadata = await getMetadata(mint.publicKey)
  const masterEdition = await getMasterEdition(mint.publicKey)

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

  console.log('TX', tx)
}

mintOne()
