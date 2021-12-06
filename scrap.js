const htmlparser2 = require('htmlparser2')
const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')
const Nightmare = require('nightmare')
const scrape = require('website-scraper')

const excludeFlag = '11111111'
const excludes = [
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'InvalidAddressBecauseDestinationIsAlsoSource',
  'NotEnoughBalanceBecauseDestinationNotCreated',
  'UnavailableTezosOriginatedAccountReceive',
  'HvwC9QSAzvGXhhVrgPmauVwFWcYZhne3hVot9EbHuFTm'
]

function listDir(directory) {
  const dirs = []
  const files = []
  const _ls = (dir) => {
    fs.readdirSync(dir)
      .map((i) => path.join(dir, i))
      .forEach((i) =>
        fs.statSync(i).isDirectory() ? dirs.push(i) && _ls(i) : files.push(i),
      )
  }
  _ls(directory)
  return { dirs, files }
}

function rmDir(directory) {
  const { dirs, files } = listDir(directory)
  files.forEach((i) => fs.rmSync(i))
  dirs.forEach((i) => fs.rmdirSync(i))
  fs.rmdirSync(directory)
}

function urlToDir(url) {
  return url.replace(/\./g, '_').replace(/[^\w-]|https|http/g, '')
}

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

async function main() {
  const url = 'https://solenforcers.io/mint/#/'
  const baseDir = './tmp/'
  const websiteDir = urlToDir(url)
  const directory = path.join(baseDir, websiteDir)
  await downloadWebsite(url, directory)
  const { files } = listDir(directory)
  const likeKeys = getLikeKeys(files)
  console.log(likeKeys)
}

main().then()
