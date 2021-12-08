const { cmd } = require('./utils')

;(async () => {
  await cmd.handleCli()
})()
  .then(() => cmd.exitProcess())
  .catch((err) => {
    console.error(err)
  })
