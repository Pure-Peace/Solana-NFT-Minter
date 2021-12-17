const solana = require('./solana')
const prompts = require('prompts')
const common = require('./common')
const web3 = require('@solana/web3.js')
const anchor = require('@project-serum/anchor')

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
 * @param {boolean?} doneExitOnCancel
 * @returns {Promise<string>}
 **/
const inputNFTsAssetsDir = async (doneExitOnCancel) => {
  const { assetsPath } = await prompts(
    {
      type: 'text',
      name: 'assetsPath',
      message: 'Please enter NFT assets path (Example: include "1.json", "1.png", "2.json", "2.png"...):',
    },
    {
      onCancel: !doneExitOnCancel && exitProcess,
    },
  )
  return assetsPath
}

const exitProcess = () => {
  console.log('\n🏳️‍🌈 Program ended')
  process.exit(0)
}



/**
 * @param {string} assetsDir
 * @returns {Promise<NFTsAssets>}
 **/
const getNFTsAssetsFromDir = async (assetsDir) => {
  if (!assetsDir) assetsDir = await inputNFTsAssetsDir()
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
  { assets, assetsDir, baseUrl, options, } = {},
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
              uri: baseUrl.replace('$id', ind + idx),
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
 * @param {boolean?} doneExitOnCancel
 * @returns {Promise<string>}
 **/
const inputBaseUrl = async (doneExitOnCancel) => {
  const { baseUrl } = await prompts(
    {
      type: 'text',
      name: 'baseUrl',
      message: 'Please input baseUrl of NFT items (Example: "https://api/$id.json". $id will be replaced with NFT id):',
      initial: 1,
      min: 0,
    },
    {
      onCancel: !doneExitOnCancel && exitProcess,
    },
  )
  return baseUrl
}


/**
 * @param {CandyMachineConfig} candyMachineConfig
 * @param {{ assets?: NFTsAssets, assetsDir?: string, options?: solana.ReuseableOptions }}
 **/
const handleConfigureCandyMachine = async (
  candyMachineConfig,
  { assets, assetsDir, baseUrl, options } = {},
) => {
  if (!baseUrl) baseUrl = await inputBaseUrl()
  if (!assets) assets = await getNFTsAssetsFromDir(assetsDir)
  options = await solana.reuseInitializer(options)
  const results = await addCandiesToCandyMachine(
    new web3.PublicKey(candyMachineConfig),
    { assets, baseUrl, options },
  )
  return { results, options }
}

/**
 * @param {boolean?} doneExitOnCancel
 * @returns {Promise<number>}
 **/
const inputSolanaPrice = async (doneExitOnCancel) => {
  const { price } = await prompts(
    {
      type: 'number',
      name: 'price',
      message: 'Please enter NFT mint price (sol):',
      initial: 1,
      float: true,
      round: 9
    },
    {
      onCancel: !doneExitOnCancel && exitProcess,
    },
  )
  return parsePrice(price, solana.LAMPORTS_PER_SOL)
}

/**
 * @param {boolean?} doneExitOnCancel
 * @returns {Promise<number>}
 **/
const inputNFTsAvailable = async (doneExitOnCancel) => {
  const { count } = await prompts(
    {
      type: 'number',
      name: 'count',
      message: 'Please enter count of NFT items available:',
      initial: 1,
      min: 0,
    },
    {
      onCancel: !doneExitOnCancel && exitProcess,
    },
  )
  return count
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
        price: new anchor.BN(parsedPrice || (await inputSolanaPrice())),
        itemsAvailable: new anchor.BN(
          NFTitemsAvailable || (await inputNFTsAvailable()),
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

module.exports = {
  initialCandyMachine,
  handleConfigureCandyMachine,
  addCandiesToCandyMachine,
  parseCandyMachineConfig,
  createCandyMachineConfig,
  readyHandleCandyMachine
}