const fs = require('fs')
const path = require('path')

/**
 * @param {string} directory
 * @returns {{ dirs: Array<string> }}
 **/
const listDir = (directory) => {
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

const rmDir = (directory) => {
  const { dirs, files } = listDir(directory)
  files.forEach((i) => fs.rmSync(i))
  dirs.forEach((i) => fs.rmdirSync(i))
  fs.rmdirSync(directory)
}

/**
 * @param {string} url
 **/
const urlToDir = (url) => {
  return url.replace(/\./g, '_').replace(/[^\w-]|https|http/g, '')
}

module.exports = {
  listDir,
  rmDir,
  urlToDir,
}
