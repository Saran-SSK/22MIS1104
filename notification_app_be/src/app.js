const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

const notificationRoutes = require('./routes/notificationRoutes')
const { requestLogger, errorHandler } = require('./middlewares/loggerMiddleware')
const { Log } = require('../../logging_middleware/logger')

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use(requestLogger)

app.get('/', (req, res) => {
	res.status(200).json({ success: true, message: 'Notification backend is running' })
})

app.use('/api/notifications', notificationRoutes)
app.use(errorHandler)

app.listen(PORT, () => {
	Log('backend', 'info', 'service', `Notification service started on port ${PORT}`)
	console.log(`Server is listening on port ${PORT}`)
})

// Global handlers to keep the process alive and log errors
process.on('uncaughtException', (err) => {
	console.error('uncaughtException:', err && err.stack ? err.stack : err)
	try {
		Log('backend', 'error', 'service', 'Uncaught exception')
	} catch (e) {
		console.error('Logger failed during uncaughtException')
	}
	// do not exit; let the process continue for now
})

process.on('unhandledRejection', (reason) => {
	console.error('unhandledRejection:', reason)
	try {
		Log('backend', 'error', 'service', 'Unhandled rejection')
	} catch (e) {
		console.error('Logger failed during unhandledRejection')
	}
})
