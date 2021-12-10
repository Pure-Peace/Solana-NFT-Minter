const solana = require('./utils/solana')
const cmd = require('./utils/cmd')
const common = require('./utils/common')
const web3 = require('@solana/web3.js')
const anchor = require('@project-serum/anchor')
const config = require('website-scraper/lib/config/defaults')

const META_DATA_MUTABLE = true
const RETAIN_AUTHORITY = true

/**
 * @typedef {{ jsonFiles: Array<string>, pngFiles: Array<string> }} NFTsAssets
 * @typedef {web3.publicKey || string} CandyMachineConfig
 **/

/**
 * @param {{ assets?: NFTsAssets, assetsDir?: string, options?: solana.ReuseableOptions }}
 **/
const createCandyMachineConfig = async ({
  assets,
  assetsDir,
  options,
} = {}) => {
  if (!assets) assets = await getNFTsAssetsFromDir(assetsDir)
  options = await solana.reuseInitializer(options)

  const NFT_COUNT = assets.jsonFiles.length
  console.log(`${NFT_COUNT} NFTs Founded`)

  const manifest = common.readJsonToObject(assets.jsonFiles[0])
  const { uuid, config, txId } = await solana.createCandyConfig(
    options.anchorProgram,
    options.payer,
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
  return { uuid, config, txId, assets, options }
}

/**
 * @param {string} assetsDir
 * @returns {Promise<NFTsAssets>}
 **/
const getNFTsAssetsFromDir = async (assetsDir) => {
  if (!assetsDir) assetsDir = await cmd.inputNFTsAssetsDir()
  const [jsonFiles, pngFiles] = ['.json', '.png'].map((i) =>
    common.listDir(assetsDir).files.filter((f) => f.endsWith(i)),
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
    solana.createConnection(cluster || (await solana.selectCluster())),
    privKey || (await solana.selectPrivKey()),
  )
  const anchorProgram = await solana.createCandyAnchorProgram(provider)
  return { anchorProgram, payer }
}


/**
 * @param {CandyMachineConfig} candyMachineConfig
 **/
const parseCandyMachineConfig = (candyMachineConfig) => {
  if (typeof candyMachineConfig === 'string') return { config: new web3.PublicKey(candyMachineConfig), configString: candyMachineConfig }
  else return { config: candyMachineConfig, configString: candyMachineConfig.toBase58() }
}

/**
 * @param {CandyMachineConfig} candyMachineConfig
 * @param {{ assets: NFTsAssets, assetsDir: string, options?: solana.ReuseableOptions }}
 **/
const addCandiesToCandyMachine = async (
  candyMachineConfig,
  { assets, assetsDir, options } = {},
) => {
  if (!assets) assets = await getNFTsAssetsFromDir(assetsDir)
  options = await solana.reuseInitializer(options)

  const jsonFiles = [...assets.jsonFiles]
  const results = []
  for (let group = 0; jsonFiles.length > 0; group++) {
    const ind = group * 10
    try {
      console.log(`Add config lines: ${ind} ~ ${ind + 10}...`)
      results.push(
        await options.anchorProgram.rpc.addConfigLines(
          ind,
          jsonFiles.splice(0, 10).map((jsonFile, idx) => {
            const { name } = common.readJsonToObject(jsonFile)
            return {
              uri: `https://osu.icu/nft/${ind + idx}.json`,
              name,
            }
          }),
          {
            accounts: {
              config: parseCandyMachineConfig(candyMachineConfig).configString,
              authority: options.payer.publicKey,
            },
            signers: [options.payer],
          },
        )
      )
    } catch (err) {
      console.log(`[ERR] Add config lines: ${ind} ~ ${ind + 10}: `, err)
    }
  }
  console.log(results.length)
  return { results, options }
}

/**
 * @param {CandyMachineConfig} candyMachineConfig
 * @param {{ assets?: NFTsAssets, assetsDir?: string, options?: solana.ReuseableOptions }}
 **/
const handleConfigureCandyMachine = async (
  candyMachineConfig,
  { assets, assetsDir, options } = {},
) => {
  if (!assets) assets = await getNFTsAssetsFromDir(assetsDir)
  options = await solana.reuseInitializer(options)
  const results = await addCandiesToCandyMachine(
    new web3.PublicKey(candyMachineConfig),
    { assets, options },
  )
  return { results, options }
}


/**
 * @param {CandyMachineConfig} candyMachineConfig
 * @param {{ parsedPrice?:number, NFTitemsAvailable?:number, options?: solana.ReuseableOptions }}
 **/
const initialCandyMachine = async (
  candyMachineConfig,
  { parsedPrice, NFTitemsAvailable, options } = {},
) => {
  options = await solana.reuseInitializer(options)

  const parsedCandyMachineConfig = parseCandyMachineConfig(candyMachineConfig)
  const uuid = parsedCandyMachineConfig.configString.slice(0, 6)
  const { config } = parsedCandyMachineConfig
  const [candyMachine, bump] = await solana.getCandyMachine(config, uuid)
  console.log('Initializing Candy machine...')
  return {
    result: await options.anchorProgram.rpc.initializeCandyMachine(
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
          wallet: options.payer.publicKey,
          config,
          authority: options.payer.publicKey,
          payer: options.payer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [],
        remainingAccounts: [],
      },
    ),
    options,
    uuid,
  }
}

  ; (async () => {
    const { config, assets, options } = await createCandyMachineConfig()
    const { results } = await handleConfigureCandyMachine(config, {
      assets,
      options,
    })
    const initialTx = await initialCandyMachine(config, {
      NFTitemsAvailable: assets.jsonFiles.length,
      options,
    })
    /* const initialTx = await initialCandyMachine('G5YP5uPChKB8E5syDJWJ5ffbb7zB3uhVuoeNRacW7kGm')
    console.log(initialTx) */
  })().then(() => process.exit(0))
