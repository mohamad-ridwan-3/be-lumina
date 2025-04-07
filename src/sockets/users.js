const users = require('../models/users')

async function isUserInOnline(id, client) {
    return await new Promise((resolve, reject) => {
        client.sCard(`user-online:${id}`)
            .then(res => {
                resolve(res > 0)
            })
            .catch(err => reject(err))
    });
}

async function userOffline(id, io, client){
    const isOtherDeviceInOnline = await isUserInOnline(id, client)

    if(isOtherDeviceInOnline === false){
        await users.updateOne({id}, {lastSeenTime: Date.now()}, {new: true})

        io.emit('userOffline', id)
    }
}

const handleDisconnected = async (id, io, client)=>{
    userOffline(id, io, client)
}

function userOnline(id, io){
    io.emit('userOnline', id)
}

async function userProfile(data, io){
    const userCurrently = await users.findOne({id: data.profileId})

    if(!userCurrently){
        return
    }

    io.emit('user-profile', {
        senderId: data.senderId,
        profile: userCurrently,
        profileIdConnection: data.profileIdConnection,
        actionType: data.actionType
    })
}

const usersSocket = {
    handleDisconnected,
    userOffline,
    userProfile,
    userOnline
}

module.exports = { usersSocket }