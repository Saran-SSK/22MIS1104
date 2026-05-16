const axios = require('axios')
const path = require('path')
const dotenv = require('dotenv')

require("dotenv").config({
   path: require("path").resolve(__dirname, "../.env")
});
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const {
  STACKS,
  LEVELS,
  BACKEND_PACKAGES,
  FRONTEND_PACKAGES,
  COMMON_PACKAGES,
} = require('./constants')

const ALL_PACKAGES = new Set([
  ...BACKEND_PACKAGES,
  ...FRONTEND_PACKAGES,
  ...COMMON_PACKAGES,
])

async function Log(stack, level, packageName, message) {
  if (typeof stack !== 'string') {
    console.error('Invalid stack type for logger')
    return null
  }
  if (!STACKS.includes(stack)) {
    console.error(`Invalid stack for logger: ${stack}`)
    return null
  }

  if (typeof level !== 'string') {
    console.error('Invalid level type for logger')
    return null
  }
  if (!LEVELS.includes(level)) {
    console.error(`Invalid level for logger: ${level}`)
    return null
  }

  if (typeof packageName !== 'string') {
    console.error('Invalid packageName type for logger')
    return null
  }
  if (!ALL_PACKAGES.has(packageName)) {
    console.error(`Invalid package for logger: ${packageName}`)
    return null
  }

  if (typeof message !== 'string') {
    console.error('Invalid message type for logger')
    return null
  }

  const token = process.env.ACCESS_TOKEN
  if (!token) {
    console.error('ACCESS_TOKEN not set in root .env')
    return null
  }

  try {
    const response = await axios.post(
      'http://4.224.186.213/evaluation-service/logs',
      { stack, level, package: packageName, message },
      { headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` } }
    )
    return response.data
  } catch (err) {
    if (err.response) {
      console.error('Logging API responded with error:', err.response.status, err.response.data)
      return null
    }
    if (err.request) {
      console.error('No response from Logging API:', err.message)
      return null
    }
    console.error('Failed to send log:', err.message)
    return null
  }
}

module.exports = { Log }
