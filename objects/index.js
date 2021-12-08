const solana = require('../utils/solana')

class Minter {
  constructor(candyData, options) {
    this.candyData = candyData
    this.options = options
  }

  /** @type {solana.ReuseableOptions} **/
  options

  /**
   * @param {string} candyProgramConfig
   * @param {solana.ReuseableOptions} options
   **/
  static async init(candyProgramConfig, options) {
    return new Minter(
      await solana.readyCandy(options.anchorProgram, candyProgramConfig),
      options,
    )
  }

  /** @param {number} mintCount **/
  async mint(mintCount) {
    return await Promise.allSettled(
      [...new Array(mintCount)].map(
        async () =>
          await solana.mintOne({
            ...this.options,
            candyData: this.candyData,
          }),
      ),
    )
  }
}

module.exports = {
  Minter,
}
