const {
  readyMint,
  mintOne,
  readyAll,
} = require('./utils')

const config = require('./config')

async function main() {
  await mintOne(await readyAll(config))
}

main().then()