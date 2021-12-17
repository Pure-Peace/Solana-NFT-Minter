const cmd = require('../utils/cmd')

;(async () => {
  await cmd.handleCli()
})()
  .then(() => cmd.exitProcess())
  .catch((err) => {
    console.error(err)
  })
