const fs = require('fs')
const path = require('path')

/**
 * @param {string} directory
 * @returns {{ dirs: Array<string>, files: Array<string> }}
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

/**
 * @param {string} directory
 **/
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

/**
 * @param {string} path
 **/
const readJsonToObject = (path) => {
  return JSON.parse(fs.readFileSync(path).toString())
}

/**
 * @param {any} obj
 **/
const saveJsonFromObject = (obj) => {
  return fs.writeSync(JSON.stringify(obj))
}

/**
 * @param {string} fmt
 * @param {Date} date
 **/
function dateFormat(fmt, date) {
  let ret
  let opt = {
    'Y+': date.getFullYear().toString(),
    'm+': (date.getMonth() + 1).toString(),
    'd+': date.getDate().toString(),
    'H+': date.getHours().toString(),
    'M+': date.getMinutes().toString(),
    'S+': date.getSeconds().toString(),
  }
  for (let k in opt) {
    ret = new RegExp('(' + k + ')').exec(fmt)
    if (ret) {
      fmt = fmt.replace(
        ret[1],
        ret[1].length == 1 ? opt[k] : opt[k].padStart(ret[1].length, '0'),
      )
    }
  }
  return fmt
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(() => resolve(), time))
}

/**
 * @param {number} price
 * @param {number} mantissa
 **/
const parsePrice = (price, mantissa) => {
  return Math.ceil(parseFloat(price) * mantissa)
}

module.exports = {
  listDir,
  rmDir,
  urlToDir,
  readJsonToObject,
  saveJsonFromObject,
  parsePrice,
  dateFormat,
  sleep,
}
