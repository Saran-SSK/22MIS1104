const {
  getTopPriorityNotifications,
  getAllNotifications: fetchAllNotifications,
  markNotificationAsRead: markAsReadNotification,
} = require('../services/notificationService')
const { Log } = require('../../../logging_middleware/logger')

const PACKAGE_NAME = 'controller'

async function getPriorityNotifications(req, res) {
  const studentId = req.query.studentId
  Log('backend', 'info', PACKAGE_NAME, 'Enter priority route')

  if (!studentId) {
    Log('backend', 'warn', PACKAGE_NAME, 'Missing studentId (priority)')
    return res.status(400).json({
      success: false,
      message: 'studentId query parameter is required',
    })
  }

  try {
    const notifications = getTopPriorityNotifications(studentId)
    Log('backend', 'info', PACKAGE_NAME, 'Priority notifications fetched')

    return res.status(200).json({ success: true, data: notifications })
  } catch (error) {
    Log('backend', 'error', PACKAGE_NAME, 'Error getPriority')
    return res.status(500).json({ success: false, message: 'Failed to fetch priority notifications' })
  }
}

async function getAllNotifications(req, res) {
  const studentId = req.query.studentId
  Log('backend', 'info', PACKAGE_NAME, 'Enter all notifications')

  if (!studentId) {
    Log('backend', 'warn', PACKAGE_NAME, 'Missing studentId (all)')
    return res.status(400).json({
      success: false,
      message: 'studentId query parameter is required',
    })
  }

  try {
    const notifications = fetchAllNotifications(studentId)
    Log('backend', 'info', PACKAGE_NAME, 'All notifications fetched')

    return res.status(200).json({ success: true, data: notifications })
  } catch (error) {
    Log('backend', 'error', PACKAGE_NAME, 'Error getAll')
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' })
  }
}

async function markNotificationAsRead(req, res) {
  const notificationId = req.params.id
  const studentId = req.query.studentId
  Log('backend', 'info', PACKAGE_NAME, 'Enter markRead route')

  if (!notificationId) {
    Log('backend', 'warn', PACKAGE_NAME, 'Missing notification id')
    return res.status(400).json({ success: false, message: 'Notification id is required' })
  }

  if (!studentId) {
    Log('backend', 'warn', PACKAGE_NAME, 'Missing studentId (markRead)')
    return res.status(400).json({ success: false, message: 'studentId query parameter is required' })
  }

  try {
    const notification = markAsReadNotification(notificationId, studentId)

    if (!notification) {
      Log('backend', 'warn', PACKAGE_NAME, 'Notification not found')
      return res.status(404).json({ success: false, message: 'Notification not found' })
    }

    Log('backend', 'info', PACKAGE_NAME, 'Marked notification as read')
    return res.status(200).json({ success: true, data: notification })
  } catch (error) {
    Log('backend', 'error', PACKAGE_NAME, 'Error markRead')
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read' })
  }
}

module.exports = {
  getPriorityNotifications,
  getAllNotifications,
  markNotificationAsRead,
}
