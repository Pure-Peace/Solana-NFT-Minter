const solana = require('./utils/solana')
const cmd = require('./utils/cmd')
const common = require('./utils/common')
const web3 = require('@solana/web3.js')
const anchor = require('@project-serum/anchor')

const ASSETS_DIR = `D:/PurePeace/Desktop/generate/assets`
const META_DATA_MUTABLE = true
const RETAIN_AUTHORITY = true

/**
 * @typedef {{ jsonFiles: Array<string>, pngFiles: Array<string> }} NFTsAssets
 **/

/**
 * @param {anchor.Program<Idl>} anchorProgram
 * @param {web3.Keypair} payer
 * @param {NFTsAssets} assets
 **/
const initCandyMachine = async (anchorProgram, payer, assets) => {
  const NFT_COUNT = assets.jsonFiles.length
  console.log(`${NFT_COUNT} NFTs Founded`)

  const manifest = common.readJsonToObject(assets.jsonFiles[0])
  const { uuid, config, txId } = await solana.createCandyConfig(
    anchorProgram,
    payer,
    {
      maxNumberOfLines: new anchor.BN(NFT_COUNT),
      symbol: manifest.symbol,
      sellerFeeBasisPoints: manifest.seller_fee_basis_points,
      isMutable: META_DATA_MUTABLE,
      maxSupply: new anchor.BN(0),
      retainAuthority: RETAIN_AUTHORITY,
      creators: manifest.properties.creators.map((creator) => {
        return {
          address: new web3.PublicKey(creator.address),
          verified: true,
          share: creator.share,
        }
      }),
    },
  )
  console.log(
    `🌈 Candy machine has been initialized successfully! \n >> PublicKey: ${config} \n >> UUID: ${uuid} \n >> TX: ${txId}`,
  )
  return { uuid, config, txId }
}

/**
 * @param {string} assertsDir
 **/
const getNFTsAssetsFromDir = (assertsDir) => {
  const [jsonFiles, pngFiles] = ['.json', '.png'].map((i) =>
    common.listDir(assertsDir).files.filter((f) => f.endsWith(i)),
  )
  if (!jsonFiles) throw new Error('No NFT assets were founded')
  return { jsonFiles, pngFiles }
}

/**
 * @param {string?} cluster
 * @param {string?} privKey
 **/
const readyHandleCandyMachine = async (cluster, privKey) => {
  const { payer, provider } = await solana.createProvider(
    solana.createConnection(cluster || (await cmd.selectCluster())),
    privKey || (await cmd.selectPrivKey()),
  )
  const anchorProgram = await solana.createCandyAnchorProgram(provider)
  return { anchorProgram, payer }
}

/**
 * @param {anchor.Program<Idl>} anchorProgram
 * @param {web3.Keypair} payer
 * @param {web3.PublicKey} candyMachineConfig
 * @param {NFTsAssets} assets
 **/
const addCandiesToCandyMachine = async (
  anchorProgram,
  payer,
  candyMachineConfig,
  assets,
) => {
  const jsonFiles = Object.assign({}, assets.jsonFiles)
  const promises = []
  for (let group = 0; jsonFiles.length > 0; group++) {
    promises.push(
      new Promise(async (resolve, reject) => {
        const res = await anchorProgram.rpc.addConfigLines(
          group,
          jsonFiles.splice(0, 10).map((jsonFile) => {
            const { name } = common.readJsonToObject(jsonFile)
            return {
              uri: `https://osu.icu/nft/${promises.length + 1}.png`,
              name,
            }
          }),
          {
            accounts: {
              config: candyMachineConfig,
              authority: payer.publicKey,
            },
            signers: [payer],
          },
        )
        return resolve(res)
      }),
    )
  }
  return await Promise.allSettled(promises)
}

/**
 * @param {string} candyMachineConfig
 **/
const handleConfigureCandyMachine = async (candyMachineConfig) => {
  const assets = getNFTsAssetsFromDir(ASSETS_DIR)
  const { anchorProgram, payer } = await readyHandleCandyMachine()
  const result = await addCandiesToCandyMachine(
    anchorProgram,
    payer,
    candyMachineConfig
      ? new web3.PublicKey(candyMachineConfig)
      : (await configureCandyMachine(anchorProgram, payer, assets)).config,
    assets,
  )
  console.log('Done: ', assets.jsonFiles.length, result)
}

/**
 * @param {web3.PublicKey} candyMachineConfig
 * @param {number} parsedPrice
 * @param {number} NFTitemsAvailable
 **/
const handleInitialCandyMachine = async (
  candyMachineConfig,
  parsedPrice,
  NFTitemsAvailable,
) => {
  const { anchorProgram, payer } = await readyHandleCandyMachine()
  return await initialCandyMachine(
    anchorProgram,
    payer,
    candyMachineConfig,
    parsedPrice,
    NFTitemsAvailable,
  )
}

/**
 * @param {anchor.Program<Idl>} anchorProgram
 * @param {web3.Keypair} payer
 * @param {string} candyMachineConfig
 * @param {number} parsedPrice
 * @param {number} NFTitemsAvailable
 **/
const initialCandyMachine = async (
  anchorProgram,
  payer,
  candyMachineConfig,
  parsedPrice,
  NFTitemsAvailable,
) => {
  const uuid = candyMachineConfig.slice(0, 6)
  const config = new web3.PublicKey(candyMachineConfig)
  const [candyMachine, bump] = await solana.getCandyMachine(config, uuid)
  return await anchorProgram.rpc.initializeCandyMachine(
    bump,
    {
      uuid,
      price: new anchor.BN(parsedPrice || (await cmd.inputSolanaPrice())),
      itemsAvailable: new anchor.BN(
        NFTitemsAvailable || (await cmd.inputNFTsAvailable()),
      ),
      goLiveDate: null,
    },
    {
      accounts: {
        candyMachine,
        wallet: payer.publicKey,
        config,
        authority: payer.publicKey,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [],
      remainingAccounts: [],
    },
  )
}

;(async () => {
  /* await handleConfigureCandyMachine(
    new web3.PublicKey('53kf3BvG4yWWDjvzjc2v8hkbSAu5QtcnttMoqcsY49xA'),
  ) */
  const r = await handleInitialCandyMachine(
    '53kf3BvG4yWWDjvzjc2v8hkbSAu5QtcnttMoqcsY49xA',
  )
  console.log(r)
})().then(() => process.exit(0))
