const { notifications } = require('../data/notifications')

function getTypeWeight(type) {
  switch (type) {
    case 'placement':
      return 3
    case 'result':
      return 2
    case 'event':
      return 1
    default:
      return 1
  }
}

function getUrgencyWeight(urgency) {
  switch (urgency) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 1
  }
}

function getRecencyWeight(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageHours = ageMs / 1000 / 60 / 60

  if (ageHours <= 6) {
    return 3
  }

  if (ageHours <= 24) {
    return 2
  }

  return 1
}

function getUnreadWeight(isRead) {
  return isRead ? 1 : 3
}

function calculatePriorityScore(notification) {
  const typeWeight = getTypeWeight(notification.type)
  const urgencyWeight = getUrgencyWeight(notification.urgency)
  const recencyWeight = getRecencyWeight(notification.createdAt)
  const unreadWeight = getUnreadWeight(notification.isRead)

  return (
    typeWeight * 40 +
    urgencyWeight * 30 +
    recencyWeight * 20 +
    unreadWeight * 10
  )
}

function getTopPriorityNotifications(studentId) {
  const studentNotifications = notifications.filter(
    (notification) => notification.studentId === studentId
  )

  const scoredNotifications = studentNotifications.map((notification) => ({
    ...notification,
    priorityScore: calculatePriorityScore(notification),
  }))

  const sortedNotifications = scoredNotifications.sort(
    (a, b) => b.priorityScore - a.priorityScore
  )

  return sortedNotifications.slice(0, 15)
}

function getAllNotifications(studentId) {
  return notifications.filter((notification) => notification.studentId === studentId)
}

function markNotificationAsRead(notificationId, studentId) {
  const notification = notifications.find(
    (item) => item.id === notificationId && item.studentId === studentId
  )

  if (!notification) {
    return null
  }

  notification.isRead = true
  return notification
}

module.exports = {
  getTopPriorityNotifications,
  getAllNotifications,
  markNotificationAsRead,
  calculatePriorityScore,
  getTypeWeight,
  getUrgencyWeight,
  getRecencyWeight,
  getUnreadWeight,
}
