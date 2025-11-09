import { ObjectId } from 'mongodb'
import { userService } from '../user/user.service.js'
import { logger } from '../../services/logger.service.js'
import { dbService } from '../../services/db.service.js'
import { asyncLocalStorage } from '../../services/als.service.js'

export const wishlistService = {
    query,
    getById,
    remove,
    add,
    update,
    addStayToWishlist,
    removeStayFromWishlist
}

async function query(filterBy = { userId: '' }) {
    try {
        const criteria = _buildCriteria(filterBy)
        const wishlistCollection = await dbService.getCollection('wishlist')
        const stayCollection = await dbService.getCollection('stay')

        const wishlists = await wishlistCollection.find(criteria).toArray()

        await Promise.all(
            wishlists.map(async (wl) => {
                if (wl.stays && wl.stays.length > 0) {
                    const stayIds = wl.stays.map(stay => new ObjectId(stay._id || stay))

                    wl.stays = await stayCollection
                        .find({ _id: { $in: stayIds } })
                        .project({
                            name: 1,
                            loc: 1,
                            price: 1,
                            imgUrls: 1,
                            summary: 1,
                            beds: 1,
                            'host.rating': 1,
                        }).toArray()
                } else {
                    wl.stays = []
                }
                if (wl.byUser?._id) {
                    wl.byUser._id = wl.byUser._id.toString()
                }
            })
        )
        // console.log('Fetched wishlists from DB:', JSON.stringify(wishlists, null, 2))
        return wishlists
    } catch (err) {
        logger.error('cannot find wishlists', err)
        throw err
    }
}

async function getById(wishlistId) {
    try {
        const criteria = { _id: ObjectId.createFromHexString(wishlistId) }

        const wishlistCollection = await dbService.getCollection('wishlist')
        const stayCollection = await dbService.getCollection('stay')

        const wishlist = await wishlistCollection.findOne(criteria)
        if (!wishlist) throw `Wishlist ${wishlistId} not found`

        if (wishlist.stays?.length) {
            const stayIds = wishlist.stays.map(id =>
                typeof id === 'string'
                    ? ObjectId.createFromHexString(id)
                    : id
            )
            wishlist.stays = await stayCollection
                .find({ _id: { $in: stayIds } })
                .project({
                    name: 1,
                    loc: 1,
                    price: 1,
                    imgUrls: 1,
                    summary: 1,
                    beds: 1,
                    'host.rating': 1,
                })
                .toArray()
        }
        // Convert ObjectIds to strings for client
        if (wishlist.byUser?._id) {
            wishlist.byUser._id = wishlist.byUser._id.toString()
        }

        wishlist.createdAt = wishlist._id.getTimestamp()
        return wishlist
    } catch (err) {
        logger.error(`while finding wishlist ${wishlistId}`, err)
        throw err
    }
}


async function remove(wishlistId) {
    const { loggedinUser } = asyncLocalStorage.getStore()
    const { _id: userId, isAdmin } = loggedinUser || {}

    try {
        const criteria = { _id: ObjectId.createFromHexString(wishlistId) }

        // Only owner or admin can remove
        if (!isAdmin) {
            const userObjectId = ObjectId.createFromHexString(userId)
            criteria['byUser._id'] = userObjectId
        }

        const collection = await dbService.getCollection('wishlist')
        const wishlist = await collection.findOne(criteria)
        if (!wishlist) throw 'Wishlist not found'

        if (!isAdmin) {
            const existingUserId = wishlist.byUser._id?.toString
                ? wishlist.byUser._id.toString()
                : wishlist.byUser._id
            if (existingUserId !== userId) throw 'Not your wishlist'
        }

        const res = await collection.deleteOne(criteria)
        if (res.deletedCount === 0) throw 'Not your wishlist or wishlist not found'

        await userService.removeWishlistFromUser(
            wishlist.byUser._id.toString(),
            wishlistId
        )

        return wishlistId
    } catch (err) {
        logger.error(`cannot remove wishlist ${wishlistId}`, err)
        throw err
    }
}

async function add(wishlist) {
    try {
        // Convert user ID to ObjectId
        const wishlistToAdd = {
            ...wishlist,
            byUser: {
                ...wishlist.byUser,
                _id: ObjectId.createFromHexString(wishlist.byUser._id)
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }

        const collection = await dbService.getCollection('wishlist')
        const res = await collection.insertOne(wishlistToAdd)

        const wishlistId = res.insertedId.toString()

        await userService.addWishlistToUser(
            wishlistToAdd.byUser._id.toString(),
            wishlistId
        )
        // Return with string ID for client
        return {
            ...wishlistToAdd,
            _id: wishlistId,
            byUser: {
                ...wishlistToAdd.byUser,
                _id: wishlistToAdd.byUser._id.toString()
            }
        }
    } catch (err) {
        logger.error('cannot insert wishlist', err)
        throw err
    }
}

async function update(wishlist) {
    const { loggedinUser } = asyncLocalStorage.getStore()
    const { _id: userId, isAdmin } = loggedinUser || {}

    try {
        const criteria = { _id: ObjectId.createFromHexString(wishlist._id) }

        // Get existing wishlist to verify ownership
        const collection = await dbService.getCollection('wishlist')
        const existingWishlist = await collection.findOne(criteria)

        if (!existingWishlist) throw 'Wishlist not found'

        // Handle both string and ObjectId formats
        const existingUserId = existingWishlist.byUser._id?.toString
            ? existingWishlist.byUser._id.toString()
            : existingWishlist.byUser._id

        if (!isAdmin && existingUserId !== userId) {
            throw 'Not your wishlist'
        }

        const wishlistToSave = {
            title: wishlist.title,
            stays: wishlist.stays,
            city: wishlist.city,
            country: wishlist.country,
            byUser: {
                ...wishlist.byUser,
                _id: typeof wishlist.byUser._id === 'string'
                    ? ObjectId.createFromHexString(wishlist.byUser._id)
                    : wishlist.byUser._id
            },
            updatedAt: Date.now()
        }

        await collection.updateOne(criteria, { $set: wishlistToSave })

        return {
            ...wishlist,
            updatedAt: wishlistToSave.updatedAt,
            byUser: {
                ...wishlist.byUser,
                _id: wishlist.byUser._id
            }
        }
    } catch (err) {
        logger.error(`cannot update wishlist ${wishlist._id}`, err)
        throw err
    }
}

async function addStayToWishlist(wishlistId, stayId) {
    const { loggedinUser } = asyncLocalStorage.getStore()
    const { _id: userId, isAdmin } = loggedinUser || {}

    try {
        const criteria = { _id: ObjectId.createFromHexString(wishlistId) }

        // Get existing wishlist to verify ownership
        const collection = await dbService.getCollection('wishlist')
        const wishlist = await collection.findOne(criteria)

        if (!wishlist) throw 'Wishlist not found'

        // Handle both string and ObjectId formats
        const existingUserId = wishlist.byUser._id?.toString
            ? wishlist.byUser._id.toString()
            : wishlist.byUser._id

        if (!isAdmin && existingUserId !== userId) {
            throw 'Not your wishlist'
        }

        // Check if stay already exists
        if (wishlist.stays.includes(stayId)) {
            throw 'Stay already in wishlist'
        }

        await collection.updateOne(
            criteria,
            {
                $push: { stays: stayId },
                $set: { updatedAt: Date.now() }
            }
        )

        return await getById(wishlistId)
    } catch (err) {
        logger.error(`cannot add stay to wishlist ${wishlistId}`, err)
        throw err
    }
}

async function removeStayFromWishlist(wishlistId, stayId) {
    const { loggedinUser } = asyncLocalStorage.getStore()
    const { _id: userId, isAdmin } = loggedinUser || {}

    try {
        const criteria = { _id: ObjectId.createFromHexString(wishlistId) }

        // Get existing wishlist to verify ownership
        const collection = await dbService.getCollection('wishlist')
        const wishlist = await collection.findOne(criteria)

        if (!wishlist) throw 'Wishlist not found'

        // Handle both string and ObjectId formats
        const existingUserId = wishlist.byUser._id?.toString
            ? wishlist.byUser._id.toString()
            : wishlist.byUser._id

        if (!isAdmin && existingUserId !== userId) {
            throw 'Not your wishlist'
        }

        await collection.updateOne(
            criteria,
            {
                $pull: { stays: stayId },
                $set: { updatedAt: Date.now() }
            }
        )

        return await getById(wishlistId)
    } catch (err) {
        logger.error(`cannot remove stay from wishlist ${wishlistId}`, err)
        throw err
    }
}

function _buildCriteria(filterBy) {
    const criteria = {}

    if (filterBy.userId) {
        criteria['byUser._id'] = ObjectId.createFromHexString(filterBy.userId)
    }

    return criteria
}


