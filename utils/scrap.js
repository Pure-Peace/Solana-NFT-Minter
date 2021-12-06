const fs = require('fs')
const path = require('path')

const scrape = require('website-scraper')
const prompts = require('prompts')

const { urlToDir, rmDir, listDir } = require('./common')
const utils = require('./solana')
const { excludeFlag, excludes } = require('../scrapConfig.json')

/**
 * @param {string} url
 * @param {string} directory
 **/
async function downloadWebsite(url, directory) {
  if (fs.existsSync(directory)) rmDir(directory)
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
  const REGEX = /(?<=")([A-Za-z0-9]{40,50})?(?=")/g
  files.forEach((i) => {
    const f = fs.readFileSync(i).toString().match(REGEX)
    f &&
      likeKeys.push(
        ...f.filter(
          (v) => !!v && !excludes.includes(v) && !v.includes(excludeFlag),
        ),
      )
  })
  return [...new Set(likeKeys)]
}

/**
 * @param {string} url
 **/
const getLikeKeysFromSite = async (url) => {
  const websiteDir = urlToDir(url)
  const tmpDir = path.join('./tmp/', websiteDir)
  await downloadWebsite(url, tmpDir)
  const { files } = listDir(tmpDir)
  return getLikeKeys(files)
}

/**
 * @param {web3.Cluster} cluster
 * @param {string} url
 **/
const getCandyFromSite = async (cluster, url) => {
  return await utils.tryGetRealCandyKeys(
    cluster,
    await getLikeKeysFromSite(url),
  )
}

const scrapCandy = async () => {
  const { url } = await prompts(
    {
      type: 'text',
      name: 'url',
      message: 'Please enter solana NFT project mint site url:',
      validate: (value) =>
        !value.includes('http://') && !value.includes('https://')
          ? `Please enter a valid url`
          : true,
    },
    {
      onCancel: () => {
        process.exit(1)
      },
    },
  )
  const { cluster } = await prompts(
    {
      type: 'select',
      name: 'cluster',
      message: 'Select solana cluster type:',
      choices: [
        {
          title: 'mainnet-beta',
          value: 'mainnet-beta',
        },
        { title: 'testnet', value: 'testnet' },
        { title: 'devnet', value: 'devnet' },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        process.exit(1)
      },
    },
  )
  console.log('⚽ Getting CandyMachine...')
  try {
    const candy = await getCandyFromSite(cluster, url)
    console.log(
      `✔️ Candy machine has been obtained!\n - MintSite: ${url}\n - CandyMachine: ${candy}`,
    )
    return { candy, url, cluster }
  } catch (err) {
    console.error(`❌ Fail to get Candy machine from site: ${url}`)
    console.error('ERROR: ', err)
    return { candy: '', url, cluster }
  }
}

const scrapCandyAndSave = async () => {
  const { candy, url, cluster } = await scrapCandy()
  if (!candy) throw new Error(`Failed to get CandyMachine from site: ${url}`)

  const file = `${urlToDir(url)}.json`
  const dir = './candyMachine'
  if (!fs.existsSync(dir)) fs.mkdirSync(dir)
  fs.writeFileSync(
    `${dir}/${file}`,
    JSON.stringify({
      CANDY_MACHINE_PROGRAM_UUID: candy.slice(0, 6),
      CANDY_MACHINE_PROGRAM_CONFIG: candy,
      CONNECTION_NETWORK: cluster,
    }),
  )
  console.log(`✔️ CandyMachine config file saved at "${dir}/${file}" !`)
}

module.exports = {
  downloadWebsite,
  getLikeKeys,
  getLikeKeysFromSite,
  getCandyFromSite,
  scrapCandy,
  scrapCandyAndSave,
}
