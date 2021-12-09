const fs = require('fs')
const path = require('path')
const scrape = require('website-scraper')

const common = require('./common')
const solana = require('./solana')

const {
  MINT_SITE_TMP_DIR,
  CANDY_MACHINE_SAVE_DIR,
  EXCLUDE_FLAG,
  EXCLUDES,
} = require('../nft-minter-config.json')

const CANDY_REGEX = /(?<=")([A-Za-z0-9]{40,50})?(?=")/g

/**
 * @param {string} url
 * @param {string} directory
 **/
async function downloadWebsite(url, directory) {
  if (fs.existsSync(directory)) common.rmDir(directory)
  return await scrape({
    urls: [url],
    directory,
    sources: [
      { selector: 'script', attr: 'src' },
      { selector: 'frame', attr: 'src' },
      { selector: 'iframe', attr: 'src' },
    ],
    subdirectories: [
      { directory: 'js', extensions: ['.js', '.ts', '.tsx', '.jsx'] },
    ],
  })
}

/**
 * @param {Array<string>} files
 **/
function getLikeKeys(files) {
  const likeKeys = []
  files.forEach((i) => {
    const f = fs.readFileSync(i).toString().match(CANDY_REGEX)
    f &&
      likeKeys.push(
        ...f.filter(
          (v) => !!v && !EXCLUDES.includes(v) && !v.includes(EXCLUDE_FLAG),
        ),
      )
  })
  return [...new Set(likeKeys)]
}

/**
 * @param {string} url
 **/
const getLikeKeysFromSite = async (url) => {
  const websiteDir = common.urlToDir(url)
  const tmpDir = path.join(MINT_SITE_TMP_DIR, websiteDir)
  await downloadWebsite(url, tmpDir)
  const { files } = common.listDir(tmpDir)
  return getLikeKeys(files)
}

/**
 * @param {string} url
 * @param {solana.ReuseableOptions} options
 **/
const getCandyFromSite = async (url, options) => {
  console.log(`\n  >> Downloading mint site ("${url}") resources...`)
  const likeKeys = await getLikeKeysFromSite(url)
  console.log(`  >> Found ${likeKeys.length} data that may be candy machines.`)
  console.log('  >> Confirming candy machine with Solana...')
  return await solana.tryGetRealCandyKeys(likeKeys, options)
}

/**
 * @param {string} url
 * @param {solana.ReuseableOptions} options
 **/
const scrapCandy = async (url, options) => {
  try {
    console.log('\n ⚽ Getting CandyMachine:')
    const data = await getCandyFromSite(url, options)
    console.log(
      `\n✔️ Candy machine has been obtained!\n\n >> 📜 Mint site: ${url}\n >> 🎁 Candy machine: ${
        data.tryCandyData.key
      }\n >> ✨ View on Explorer: ${solana.explorerUrl(
        data.tryCandyData.key,
        options.cluster,
      )}\n`,
    )
    return { data }
  } catch (err) {
    console.error(`❌ Fail to get Candy machine from site: ${url}`)
    console.error('== ERROR: ', err)
    return { err }
  }
}

/**
 * @param {string} url
 * @param {solana.ReuseableOptions} options
 **/
const scrapCandyAndSave = async (url, options) => {
  const { data, err } = await scrapCandy(url, options)
  if (err) return { err }

  const file = `${common.urlToDir(url)}.json`
  if (!fs.existsSync(CANDY_MACHINE_SAVE_DIR))
    fs.mkdirSync(CANDY_MACHINE_SAVE_DIR)

  const fullPath = path.join(CANDY_MACHINE_SAVE_DIR, file)
  data.candyConfig = {
    CANDY_MACHINE_PROGRAM_UUID: data.tryCandyData.key.slice(0, 6),
    CANDY_MACHINE_PROGRAM_CONFIG: data.tryCandyData.key,
    CONNECTION_NETWORK: options.cluster,
  }
  fs.writeFileSync(fullPath, JSON.stringify(data.candyConfig))
  console.log(`✔️ Candy machine config file saved at "${fullPath}" !`)
  return { data, url, fullPath }
}

module.exports = {
  downloadWebsite,
  getLikeKeys,
  getLikeKeysFromSite,
  getCandyFromSite,
  scrapCandy,
  scrapCandyAndSave,
  CANDY_REGEX,
}
