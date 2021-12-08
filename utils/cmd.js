const prompts = require('prompts')
const fs = require('fs')
const path = require('path')

const {
  SOLANA_ACCOUNTS_DIR,
  CANDY_MACHINE_SAVE_DIR,
  DEFAULT_BATCH_GET_CANDY_MACHINE_FILE,
  DEFAULT_BATCH_MINT_DIR,
  DEFAULT_NFT_MINT_COUNT,
} = require('../nft-minter-config.json')

const solana = require('./solana')
const scrap = require('./scrap')
const { listDir, readJsonToObject } = require('./common')

const { Minter } = require('../objects')

const exitProcess = () => {
  console.log('\n🏳️‍🌈 Program ended')
  process.exit(0)
}

/**
 * @param {boolean} exitOnCancel
 * @returns {Promise<string>}
 **/
const selectCluster = async (exitOnCancel) => {
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
      onCancel: exitOnCancel && exitProcess,
    },
  )
  return cluster
}

/**
 * @param {boolean} exitOnCancel
 * @returns {Promise<string>}
 **/
const inputUrl = async (exitOnCancel) => {
  const { url } = await prompts(
    {
      type: 'text',
      name: 'url',
      message: 'Please enter solana NFT project mint site url:',
      validate: (value) =>
        !value.includes('http://') && !value.includes('https://')
          ? `Please enter a valid url (starts with "http://" or "https://")`
          : true,
    },
    {
      onCancel: exitOnCancel && exitProcess,
    },
  )
  return url
}

/**
 * @param {boolean} exitOnCancel
 * @param {string?} defaultPath
 **/
const jsonFromFile = async (exitOnCancel, defaultPath) => {
  const { file } = await prompts(
    {
      type: 'text',
      name: 'file',
      message: 'Please enter ".json" file path:',
      initial: defaultPath,
    },
    {
      onCancel: exitOnCancel && exitProcess,
    },
  )
  return readJsonToObject(file)
}

/**
 * @param {boolean} exitOnCancel
 * @param {number?} defaultCount
 * @returns {Promise<number>}
 **/
const inputMintCount = async (exitOnCancel, defaultCount = 1) => {
  const { count } = await prompts(
    {
      type: 'number',
      name: 'count',
      message: 'Please enter NFT mint count:',
      initial: defaultCount,
      min: 1,
    },
    {
      onCancel: exitOnCancel && exitProcess,
    },
  )
  return count
}

/**
 * @param {boolean} exitOnCancel
 * @returns {Promise<Uint8Array>}
 **/
const selectPrivKey = async (exitOnCancel) => {
  const { privKey } = await prompts(
    {
      type: 'select',
      name: 'privKey',
      message: 'Select an privKey file:',
      choices: fs.readdirSync(SOLANA_ACCOUNTS_DIR).map((f) => {
        return {
          title: f,
          value: solana.getPrivKey(path.join(SOLANA_ACCOUNTS_DIR, f)),
        }
      }),
      initial: 0,
    },
    {
      onCancel: exitOnCancel && exitProcess,
    },
  )
  return privKey
}

/**
 * @param {solana.ReuseableOptions?} options
 **/
const cmdReuseInitializer = async (options) => {
  if (!options) {
    const cluster = await selectCluster(true)
    const privKey = await selectPrivKey(true)
    options = { cluster, privKey }
  }
  return await solana.reuseInitializer(options)
}

/**
 * @param {number} handle
 * @param {boolean} shouldMintingLater
 * @param {solana.ReuseableOptions?} options
 **/
const cliGetCandyMachine = async (handle, shouldMintingLater, options) => {
  let mintResults

  const urls =
    handle === 0
      ? [await inputUrl(true)]
      : await jsonFromFile(true, DEFAULT_BATCH_GET_CANDY_MACHINE_FILE)
  console.log(` ✔️ We have got ${urls.length} mint site`)
  options = await cmdReuseInitializer(options)

  /** @type {Array<{ url: string, data: solana.GetRealCandyKeysResult, success: boolean }>} **/
  const scarpResults = (
    await Promise.allSettled(
      urls.map(async (url) => {
        const { data, err } = await scrap.scrapCandyAndSave(url, options)
        if (!options?.anchorProgram && data) options = data
        return { url, data, success: !err }
      }),
    )
  ).map((i) => i.value)

  if (shouldMintingLater) {
    mintResults = await cliMintingNFT(
      scarpResults.map((i) => {
        return i.data.candyConfig
      }),
      options,
    )
  }
  return { scarpResults, mintResults }
}

/**
 * @param {solana.ReuseableOptions?} options
 **/
const handleCliGetCandyMachine = async (options) => {
  const { shouldMintingLater } = await prompts(
    {
      type: 'confirm',
      name: 'shouldMintingLater',
      message:
        'Whether to start minting immediately after getting the Candy machine?',
    },
    {
      onCancel: exitProcess,
    },
  )
  const { handle } = await prompts(
    {
      type: 'select',
      name: 'handle',
      message: 'One mint site or multiple?:',
      choices: ['One mint site', 'Multiple urls'],
      initial: 0,
    },
    {
      onCancel: exitProcess,
    },
  )
  const { scarpResults, mintResults } = await cliGetCandyMachine(
    handle,
    shouldMintingLater,
    options,
  )
  scarpResults?.constructor === Array &&
    console.log(
      `🌈 Scrap: Get ${scarpResults.length} results, Success: ${
        scarpResults.filter((v) => v.success).length
      }, Error: ${scarpResults.filter((v) => !v.success).length}!`,
    )
  mintResults?.constructor === Array &&
    console.log(
      `🌈 Mint: Get ${mintResults.length} results, Success: ${
        mintResults.filter((v) => v.success).length
      }, Error: ${mintResults.filter((v) => !v.success).length}!`,
    )
  return { scarpResults, mintResults }
}

/**
 * @param {solana.ReuseableOptions?} options
 **/
const cliInputCandyAndMint = async (options) => {
  const { CANDY_MACHINE_PROGRAM_CONFIG } = await prompts(
    {
      type: 'text',
      name: 'CANDY_MACHINE_PROGRAM_CONFIG',
      message: 'Please input Candy machine:',
      validate: (v) =>
        !v.length >= 40 && !v.length <= 50 ? 'Not a valid candy machine' : true,
    },
    {
      onCancel: exitProcess,
    },
  )
  return await cliMintingNFT([{ CANDY_MACHINE_PROGRAM_CONFIG }], options)
}

/**
 * @param {solana.ReuseableOptions?} options
 **/
const cliSelectCandyAndMint = async (options) => {
  const { files } = listDir(CANDY_MACHINE_SAVE_DIR)
  const { selects } = await prompts(
    {
      type: 'multiselect',
      name: 'selects',
      message: 'Please choice a Candy machine (multiple choice):',
      choices: files,
    },
    {
      onCancel: exitProcess,
    },
  )
  return await cliMintingNFT(
    selects.map((f) => readJsonToObject(files[f])),
    options,
  )
}

/**
 * @param {solana.ReuseableOptions?} options
 **/
const cliLoadCandyAtDirAndMint = async (options) => {
  const { dir } = await prompts(
    {
      type: 'text',
      name: 'dir',
      message: 'Please input Candy machines config files directory:',
      initial: DEFAULT_BATCH_MINT_DIR,
    },
    {
      onCancel: exitProcess,
    },
  )
  const { files } = listDir(dir)
  return await cliMintingNFT(
    files.map((f) => readJsonToObject(f)),
    options,
  )
}

/**
 * @param {solana.ReuseableOptions?} options
 **/
const handleCliMintingNFT = async (options) => {
  const mintingHandles = [
    cliInputCandyAndMint,
    cliSelectCandyAndMint,
    cliLoadCandyAtDirAndMint,
  ]
  const { handle } = await prompts(
    {
      type: 'select',
      name: 'handle',
      message: 'Mint with one Candy machines or multiple?:',
      choices: [
        'Input One',
        'Let me select',
        'I have a lot of Candy machines (At dir)',
      ],
      initial: 0,
    },
    {
      onCancel: exitProcess,
    },
  )
  const results = await mintingHandles[handle](options)
  console.log(
    `🌈 Mint: Get ${results.length} results, Success: ${
      results.filter((v) => v.success).length
    }, Error: ${results.filter((v) => !v.success).length}!`,
  )
  return results
}

/**
 * @param {Array<{CANDY_MACHINE_PROGRAM_CONFIG: string, CANDY_MACHINE_PROGRAM_UUID?: string, CONNECTION_NETWORK?: string, MINT_COUNT?: number}>} candyMachineKeys
 * @param {solana.ReuseableOptions?} options
 **/
const cliMintingNFT = async (candyMachineKeys, options) => {
  options = await cmdReuseInitializer(options)
  return (
    await Promise.allSettled(
      candyMachineKeys.map(async (v) => {
        const minter = await Minter.init(
          v.CANDY_MACHINE_PROGRAM_CONFIG,
          options,
        )
        const result = await minter.mint(
          candyMachineKeys.MINT_COUNT ||
            (await inputMintCount(true, DEFAULT_NFT_MINT_COUNT)),
        )
        return { minter, result }
      }),
    )
  ).map((p) => {
    return { ...p.value, success: p.status != 'rejected', err: p.reason }
  })
}

const handleCli = async () => {
  console.log('\nWelcome to Solana-NFT-Minter!\n')
  const cliHandles = [handleCliGetCandyMachine, handleCliMintingNFT]
  const { handle } = await prompts(
    {
      type: 'select',
      name: 'handle',
      message: 'Please select an handle:',
      choices: [
        '1. Get Candy machine from NFT mint site',
        '2. Minting NFT with Candy machine config',
      ],
      initial: 0,
    },
    {
      onCancel: exitProcess,
    },
  )
  return await cliHandles[handle]()
}

module.exports = {
  exitProcess,
  inputUrl,
  selectCluster,
  selectPrivKey,
  handleCliGetCandyMachine,
  handleCliMintingNFT,
  handleCli,
}
