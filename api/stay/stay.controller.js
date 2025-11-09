import { logger } from '../../services/logger.service.js'
import { stayService } from './stay.service.js'
import { asyncLocalStorage } from '../../services/als.service.js'

export async function getStays(req, res) {
    try {
        // console.log('Received query params:', req.query) 
        const filterBy = {
            txt: req.query.txt || '',
            minPrice: +req.query.minPrice || 0,
            sortField: req.query.sortField || '',
            sortDir: +req.query.sortDir || 1,
            pageIdx: req.query.pageIdx,
            city: req.query.city || '',
            type: req.query.type || '',
            guests: +req.query.guests || 0,
        }
        // console.log('Built filterBy:', filterBy)

        const stays = await stayService.query(filterBy)
        // console.log('Found stays:', stays.length)
        res.json(stays)
    } catch (err) {
        logger.error('Failed to get stays', err)
        res.status(400).send({ err: 'Failed to get stays' })
    }
}

export async function getStayById(req, res) {
    try {
        const stayId = req.params.id
        const stay = await stayService.getById(stayId)
        res.json(stay)
    } catch (err) {
        logger.error('Failed to get stay', err)
        res.status(400).send({ err: 'Failed to get stay' })
    }
}

export async function addStay(req, res) {
    const store = asyncLocalStorage.getStore()
    const loggedinUser = store?.loggedinUser || req.loggedinUser
    const { body } = req

    try {
        const {
            name,
            type,
            summary = '',
            price,
            capacity,
            guests,
            bedrooms,
            beds,
            bathrooms,
            roomType,
            imgUrls = [],
            loc = { city: '', country: '', address: '' },
            amenities = [],
            availableFrom = null,
            availableUntil = null
        } = body

        const stayCapacity = capacity || guests || 1

        if (price === undefined || price === null) {
            return res.status(400).send({ err: 'Price is required' })
        }

        // Set default dates (like local service)
        const today = new Date()
        const twoMonthsLater = new Date()
        twoMonthsLater.setDate(today.getDate() + 60)

        const formatDate = (date) => date.toISOString().split('T')[0]

        const stay = {
            name: name || 'Untitled Stay',
            type: type || 'House',
            summary,
            price,
            capacity: stayCapacity,
            guests: stayCapacity,
            bedrooms: bedrooms || 1,
            beds: beds || 1,
            bathrooms: bathrooms || 1,
            roomType: roomType || '',
            imgUrls,
            loc,
            amenities,
            availableFrom: availableFrom || formatDate(today),
            availableUntil: availableUntil || formatDate(twoMonthsLater),
            host: {
                _id: loggedinUser?._id,
                fullname: loggedinUser?.fullname,
                imgUrl: body.host?.imgUrl || loggedinUser?.imgUrl || null
            },
            reviews: [],
            likedByUsers: [],
            msgs: []
        }

        const addedStay = await stayService.add(stay)
        res.status(201).json(addedStay)
    } catch (err) {
        logger.error('Failed to add stay', err)
        res.status(400).send({ err: 'Failed to add stay' })
    }
}

export async function updateStay(req, res) {
    const store = asyncLocalStorage.getStore()
    const loggedinUser = store?.loggedinUser || req.loggedinUser
    const { body } = req
    
    const userId = loggedinUser?._id
    const isAdmin = loggedinUser?.isAdmin

    logger.info(`UpdateStay - userId: ${userId}, isAdmin: ${isAdmin}`)

    try {
        const stay = { ...body, _id: req.params.id }

        // Validate price
        if (stay.price === undefined || stay.price === null) {
            return res.status(400).send({ err: 'Price is required' })
        }

        const existingStay = await stayService.getById(stay._id)
        const existingHostId = String(existingStay.host._id)

        logger.info(`Comparing - existingHostId: ${existingHostId}, userId: ${userId}`)

        if (!isAdmin && existingHostId !== String(userId)) {
            logger.warn(`Auth failed: host=${existingHostId}, user=${userId}`)
            return res.status(403).send('Not your stay')
        }

        // Preserve original host
        stay.host = existingStay.host

        const updated = await stayService.update(stay)
        res.json(updated)
    } catch (err) {
        logger.error('Failed to update stay', err)
        res.status(400).send({ err: 'Failed to update stay' })
    }
}

export async function removeStay(req, res) {
    try {
        const stayId = req.params.id
        const removedId = await stayService.remove(stayId)
        res.send(removedId)
    } catch (err) {
        logger.error('Failed to remove stay', err)
        res.status(400).send({ err: 'Failed to remove stay' })
    }
}

export async function addStayReview(req, res) {
    const store = asyncLocalStorage.getStore()
    const loggedinUser = store?.loggedinUser || req.loggedinUser

    try {
        const stayId = req.params.id
        const txt = req.body.txt

        const savedReview = await stayService.addStayReview(stayId, txt, loggedinUser)
        res.status(201).json(savedReview)
    } catch (err) {
        logger.error('Failed to add stay review', err)
        res.status(400).send({ err: 'Failed to add stay review' })
    }
}

export async function removeStayReview(req, res) {
    try {
        const { id: stayId, reviewId } = req.params
        const removedId = await stayService.removeStayReview(stayId, reviewId)
        res.send(removedId)
    } catch (err) {
        logger.error('Failed to remove stay review', err)
        res.status(400).send({ err: 'Failed to remove stay review' })
    }
}

// MESSAGE ROUTES 

export async function addStayMsg(req, res) {
    const store = asyncLocalStorage.getStore()
    const loggedinUser = store?.loggedinUser || req.loggedinUser

    try {
        const stayId = req.params.id
        const { txt } = req.body

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not logged in' })
        }

        const msg = await stayService.addStayMsg(stayId, txt, loggedinUser)
        res.status(201).json(msg)
    } catch (err) {
        logger.error('Failed to add stay message', err)
        res.status(400).send({ err: 'Failed to add stay message' })
    }
}

export async function removeStayMsg(req, res) {
    const store = asyncLocalStorage.getStore()
    const loggedinUser = store?.loggedinUser || req.loggedinUser

    try {
        const { id: stayId, msgId } = req.params

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not logged in' })
        }

        const removedId = await stayService.removeStayMsg(stayId, msgId, loggedinUser)
        res.send(removedId)
    } catch (err) {
        logger.error('Failed to remove stay message', err)
        res.status(400).send({ err: 'Failed to remove stay message' })
    }
}

export async function getStayMsgs(req, res) {
    try {
        const stayId = req.params.id
        const msgs = await stayService.getStayMsgs(stayId)
        res.json(msgs)
    } catch (err) {
        logger.error('Failed to get stay messages', err)
        res.status(400).send({ err: 'Failed to get stay messages' })
    }
}