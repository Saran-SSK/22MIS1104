const { Log } = require('../../../logging_middleware/logger')

const PACKAGE_NAME = 'middleware'

function requestLogger(req, res, next) {
	Log('backend', 'info', PACKAGE_NAME, 'Incoming request')
	next()
}

function errorHandler(err, req, res, next) {
  Log('backend', 'error', PACKAGE_NAME, 'Unhandled error')
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  })
}

module.exports = {
	requestLogger,
	errorHandler,
}
