const express = require('express')
const router = express.Router()

const {
  getPriorityNotifications,
  getAllNotifications,
  markNotificationAsRead,
} = require('../controllers/notificationController')

router.get('/priority/:studentId', getPriorityNotifications)
router.get('/:studentId', getAllNotifications)
router.patch('/read/:id', markNotificationAsRead)

module.exports = router
