const { readJsonToObject, dateFormat } = require('./utils/common')
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
/** @type {string} **/
var configPath
/** @type {{ info: Logger, err: Logger, tx: Logger }} **/
var log = {}
/** @type {string || undefined} **/
var LOGS_DIR
/** @type {Date || undefined} **/
var LOGS_DATE
/** @type {string || undefined} **/
var LOGS_DATE_TEXT

function parseConfig() {
  configPath = path.join(process.argv[2])
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
  log[method] = (msg) => {
    RC++
    file.write(typeof msg === 'string' ? msg : `${msg}`, 'utf-8', () => {
      RC--
    })
  }
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

async function main() {
  parseConfig()
  initLoggers()
  log.tx(666)
  log.err('asgasg')
  log.info(444)
}

main().then(() => {
  // Wait for all asynchronous operations to complete
  setInterval(() => {
    if (!RC) process.exit(0)
  }, 100)
})
