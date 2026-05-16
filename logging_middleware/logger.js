const axios = require('axios')
const path = require('path')
const dotenv = require('dotenv')

require('dotenv').config()
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
  if (typeof stack !== 'string') throw new TypeError('stack must be a string')
  if (!STACKS.includes(stack)) throw new Error(`Invalid stack "${stack}". Allowed: ${STACKS.join(', ')}`)

  if (typeof level !== 'string') throw new TypeError('level must be a string')
  if (!LEVELS.includes(level)) throw new Error(`Invalid level "${level}". Allowed: ${LEVELS.join(', ')}`)

  if (typeof packageName !== 'string') throw new TypeError('packageName must be a string')
  if (!ALL_PACKAGES.has(packageName)) {
    const allowed = [...ALL_PACKAGES].join(', ')
    throw new Error(`Invalid package "${packageName}". Allowed: ${allowed}`)
  }

  if (typeof message !== 'string') throw new TypeError('message must be a string')

  const token = process.env.ACCESS_TOKEN
  if (!token) throw new Error('ACCESS_TOKEN not set in root .env')

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
      throw new Error(`Logging API error: ${err.response.status}`)
    }
    if (err.request) {
      console.error('No response from Logging API:', err.message)
      throw new Error('No response from Logging API')
    }
    console.error('Failed to send log:', err.message)
    throw err
  }
}

module.exports = { Log }
