const { scrapCandyAndSave } = require('./utils/scrap')

;(async () => {
  await scrapCandyAndSave()
})()
  .then(() => process.exit(1))
  .catch((err) => {
    console.error(err)
  })
