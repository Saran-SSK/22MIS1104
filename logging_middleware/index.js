const { Log } = require('./logger')

async function testLogger() {
	try {
		const res = await Log('backend', 'info', 'handler', 'Logger initialized successfully')
		console.log('Log sent successfully', res)
	} catch (err) {
		console.error('Log failed:', err && err.message ? err.message : err)
		process.exitCode = 1
	}
}

testLogger()
