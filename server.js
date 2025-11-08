import http from 'http'
import path from 'path'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'

import { authRoutes } from './api/auth/auth.routes.js'
import { userRoutes } from './api/user/user.routes.js'
import { reviewRoutes } from './api/review/review.routes.js'
import { stayRoutes } from './api/stay/stay.routes.js'
import { wishlistRoutes } from './api/wishlist/wishlist.routes.js'
import { orderRoutes } from './api/order/order.routes.js'

import { setupSocketAPI } from './services/socket.service.js'

import { setupAsyncLocalStorage } from './middlewares/setupAls.middleware.js'

const app = express()
const server = http.createServer(app)

// Express App Config
app.use(cookieParser())
app.use(express.json())
// Serve built frontend from /public so asset requests (JS/CSS/favicon) are handled
// before the SPA fallback. This also makes local testing easier.
app.use(express.static(path.resolve('public')))

if (process.env.NODE_ENV !== 'production') {
    const corsOptions = {
        origin: [
            'http://127.0.0.1:3000',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://localhost:5173',
            'https://clubnb.onrender.com/'
        ],
        credentials: true
    }
    app.use(cors(corsOptions))
}
// Ensure ALS middleware runs for every route
// use app.use so no path-to-regexp parsing is required (avoids PathError for '*')
app.use('/*all',setupAsyncLocalStorage)

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/review', reviewRoutes)
app.use('/api/stay', stayRoutes)
app.use('/api/wishlist', wishlistRoutes)
app.use('/api/order', orderRoutes)

setupSocketAPI(server)

// Make every unhandled server-side-route match index.html
// so when requesting http://localhost:3030/unhandled-route... 
// it will still serve the index.html file
// and allow vue/react-router to take it from there

// SPA fallback: serve index.html for any unmatched route (including '/').
// Use app.use without a path so router doesn't parse a '*' pattern.
app.use('/*all', (req, res) => {
    console.log('SPA fallback serving index.html for', req.originalUrl)
    res.sendFile(path.resolve('public/index.html'))
})

import { logger } from './services/logger.service.js'
const port = process.env.PORT || 3030

server.listen(port, () => {
    logger.info(`Server listening on port http://127.0.0.1:${port}`)
})