const { readJsonToObject } = require('./utils/common')

const config = readJsonToObject(process.argv[2])

console.log(config)