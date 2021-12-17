const {
  readJsonToObject,
  dateFormat,
  saveJsonFromObject,
  sleep,
} = require('./common')
const scrap = require('./scrap')
const solana = require('./solana')
const prompts = require('prompts')

const path = require('path')
const fs = require('fs')

/**
 * @typedef {{
 *   name: string,
 *   cluster: string,
 *   candyMachine: string,
 *   mintUrl: string,
 *   walletPrivKey: string,
 *   mintCount: number,
 *   logsDir: string
 * }} OneClickMintConfigSchema
 *
 * @typedef {(msg) => void} Logger
 **/

/** @type {number} **/
var RC = 0
/** @type {OneClickMintConfigSchema} **/
var config
/** @type {{ info: Logger, err: Logger, tx: Logger }} **/
var log = {}
/** @type {string || undefined} **/
var LOGS_DIR
/** @type {Date || undefined} **/
var LOGS_DATE
/** @type {string || undefined} **/
var LOGS_DATE_TEXT
/** @type {boolean} **/
var stopping = false
/** @type {number || undefined} **/
var _balanceCheck
/** @type {boolean} **/
var endFlag = false

function parseConfig(configPath) {
  /** @type {OneClickMintConfigSchema} **/
  config = readJsonToObject(configPath)
  return { config, configPath }
}

/**
 * @param {string} method
 **/
function registLogger(method) {
  const file = fs.createWriteStream(path.join(LOGS_DIR, `${method}.out`), {
    flags: 'w+',
    encoding: 'utf-8',
    autoClose: true,
  })
  const logger = (msg, end = '\n') => {
    RC++
    file.write(
      dateFormat('YYYY-mm-dd HH:MM:SS >> ', new Date()) + msg + end,
      'utf-8',
      () => {
        RC--
      },
    )
  }
  log[method] = logger
}

function initLoggers() {
  LOGS_DATE = new Date()
  LOGS_DATE_TEXT = dateFormat('YYYY-mm-dd_HH-MM-SS', LOGS_DATE)
  LOGS_DIR = path.join(config.logsDir, `${config.name}_${LOGS_DATE_TEXT}`)
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR)
  }
  ;['info', 'err', 'tx'].forEach((i) => {
    registLogger(i)
  })
}

function stopProcess(code) {
  if (stopping) return
  stopping = true
  // Wait for all asynchronous operations to complete
  setInterval(() => {
    if (!RC) {
      console.log(`PID: ${process.pid} Process END.`)
      process.exit(code)
    }
  }, 100)
}

function check() {
  config.candyMachine = config.candyMachine.trim()
  config.mintUrl = config.mintUrl.trim()

  if (!config.candyMachine && !config.mintUrl) {
    throw new Error('[Require candy machine or mint site url]')
  }

  if (config.mintUrl.includes(' ') || config.candyMachine.includes(' ')) {
    throw new Error('[mintUrl and candyMachine should not have spaces]')
  }

  if (!config.cluster) {
    throw new Error('[Require solana cluster]')
  }

  if (!config.candyMachine.length >= 40 && !config.candyMachine.length <= 50) {
    throw new Error('[Not a valid candy machine]')
  }

  log.info(
    `Config Loaded! Task: "${config.name}"; Cluster: "${config.cluster
    }"; MintCount: "${config.mintCount === -1 ? 'Unlimited' : config.mintCount
    }"; Candy Machine: "${config.candyMachine}"`,
  )
}

async function readyCandyData(anchorProgram) {
  if (!config.candyMachine) {
    if (
      !config.mintUrl.includes('http://') &&
      !config.mintUrl.includes('https://')
    ) {
      throw new Error(
        `[Please enter a valid url] (starts with "http://" or "https://")`,
      )
    }
    return await getCandyMachinefromUrl(anchorProgram)
  }
  return await solana.readyCandy(anchorProgram, config.candyMachine)
}

async function getCandyMachinefromUrl(anchorProgram) {
  try {
    log.info(
      `CandyMachine is not found, try to get it from MintUrl (${config.mintUrl})`,
    )
    log.info(`Downloading mint site resources...`)
    const likeKeys = await scrap.getLikeKeysFromSite(config.mintUrl)

    log.info(
      `Found ${likeKeys.length} data that may be candy machines.\nConfirming candy machine with Solana...`,
    )
    const {
      tryCandyData: { key, candyData },
    } = await solana.tryGetRealCandyKeys(likeKeys, { anchorProgram })

    log.info(`Candy machine has been obtained: ${key}, saving...`)
    config.candyMachine = key
    saveJsonFromObject(config)

    return candyData
  } catch (err) {
    throw new Error(
      '[Failed to get candy machine from mint site], Error: ' + err,
    )
  }
}

async function ready() {
  log.info(`Connecting to cluster (${config.cluster})...`)
  const connection = solana.createConnection(config.cluster)
  const { wallet, provider } = await solana.createProvider(
    connection,
    solana.getPrivKey(config.walletPrivKey),
  )
  const anchorProgram = await solana.createCandyAnchorProgram(provider)
  return { anchorProgram, wallet, provider }
}

async function checkBalance(connection, publicKey) {
  const balance =
    (await connection.getBalance(publicKey)) / solana.LAMPORTS_PER_SOL
  log.info(`CURRENT BALANCE: ${balance} sol`)
  if (balance < 1) {
    endFlag = true
    log.info('Insufficient balance (< 1), will end.')
  }
  return balance
}

async function balanceChecker(connection, publicKey) {
  if (_balanceCheck) return
  await checkBalance(connection, publicKey)
  _balanceCheck = setInterval(async () => {
    await checkBalance(connection, publicKey)
  }, 5000)
}

async function minting(candyData, readyData) {
  const { wallet, provider, anchorProgram } = readyData
  let results = []
  const task = async (i) => {
    if (endFlag) {
      log.info(`Stopping, skip task #${i}!`)
      return { index: i, success: false, tx: null }
    }
    try {
      log.info(`Mint #${i}...`)
      const tx = await solana.mintOne({
        anchorProgram,
        wallet,
        provider,
        candyData,
      })
      log.tx(tx)
      return { index: i, success: true, tx }
    } catch (err) {
      log.err(`[MINT] #${i}: ${err}`)
      return { index: i, success: false, tx: null }
    }
  }

  if (config.mintCount >= 0) {
    log.info(`Minting count: ${config.mintCount}`)
    balanceChecker(readyData.provider.connection, readyData.wallet.publicKey)
    results = new Array(
      (
        await Promise.allSettled(
          [...new Array(config.mintCount).keys()].map(task),
        )
      ).map((p) => p.value),
    )
  } else {
    log.info(`!!!!! Infinite mint !!!!!`)
    let i = 0
    balanceChecker(readyData.provider.connection, readyData.wallet.publicKey)
    while (!endFlag) {
      if (i % 10 === 0) await sleep(1000)
      results.push(task(i))
      i++
    }
  }

  log.info('Writing results...')
  fs.writeFileSync(
    path.join(LOGS_DIR, `mint_result_${LOGS_DATE_TEXT}.json`),
    JSON.stringify(results),
  )
  log.info('Done!==')
}

async function main(withCmd) {
  try {
    parseConfig(withCmd ? (await prompts(
      {
        type: 'text',
        name: 'value',
        message: 'Please input Minting config file path:',
      },
      {
        onCancel: () => process.exit(1),
      },
    )).value : path.join(process.argv[2]))
    initLoggers()
    check()

    const readyData = await ready()
    const candyData = await readyCandyData(readyData.anchorProgram)
    await minting(candyData, readyData)
    stopProcess(0)
  } catch (err) {
    console.error(err)
    stopProcess(1)
  }
}


module.exports = {
  main
}