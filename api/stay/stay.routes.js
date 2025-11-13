import express from 'express'
import { log } from '../../middlewares/logger.middleware.js'
import { 
    getStays, 
    getStayById, 
    addStay, 
    updateStay, 
    removeStay, 
    addStayReview, 
    removeStayReview,
    addStayMsg,
    removeStayMsg,
    getStayMsgs,
    getUserConversations  
} from './stay.controller.js'

const router = express.Router()

// Conversations route
router.get('/user/conversations', log, getUserConversations)

// Public routes
router.get('/', log, getStays)
router.get('/:id', log, getStayById)

// Protected routes - auth checked in controller (like home.routes)
router.post('/', log, addStay)
router.put('/:id', log, updateStay)
router.delete('/:id', log, removeStay)

// Review routes
router.post('/:id/review', log, addStayReview)
router.delete('/:id/review/:reviewId', log, removeStayReview)

// Message routes
router.get('/:id/msg', log, getStayMsgs)
router.post('/:id/msg', log, addStayMsg)
router.delete('/:id/msg/:msgId', log, removeStayMsg)

export const stayRoutes = router