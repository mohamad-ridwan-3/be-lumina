const chatRoomDB = require('../models/chatRoom')
const chatsDB = require('../models/chats')
const dayjs = require('dayjs');
require('dayjs/locale/id');
const isToday = require('dayjs/plugin/isToday');
const isYesterday = require('dayjs/plugin/isYesterday');
const weekOfYear = require('dayjs/plugin/weekOfYear');
const weekday = require('dayjs/plugin/weekday');

dayjs.extend(isToday);
dayjs.extend(isYesterday);
dayjs.extend(weekOfYear);
dayjs.extend(weekday);

const formatDate = (date) => {
    const today = dayjs().startOf('day');
    const yesterday = dayjs().subtract(1, 'day').startOf('day');
    const now = dayjs();
    const dateToCheck = dayjs(date);
  
    if (dateToCheck.isSame(today, 'day')) {
      return 'Today';
    } else if (dateToCheck.isSame(yesterday, 'day')) {
      return 'Yesterday';
    } else if (
      dateToCheck.isSame(now, 'week') &&
      !dateToCheck.isSame(today, 'day') &&
      !dateToCheck.isSame(yesterday, 'day')
    ) {
      return dateToCheck.format('dddd');
    } else {
      return dateToCheck.format('DD MMMM YYYY');
    }
};

async function isUserInRoom(chatId, chatRoomId, userId, client) {
    return await new Promise((resolve, reject) => {
        client.sCard(`chats:${chatId}:room:${chatRoomId}:users:${userId}`)
            .then(res => {
                resolve(res > 0)
            })
            .catch(err => reject(err))
    });
}

const handleDisconnected = ({chatRoomId, chatId, userId, socketId}, client)=>{
    client.sRem(`chats:${chatId}:room:${chatRoomId}:users:${userId}`, socketId); // Hapus userId dari set Redis

    console.log(`User ${socketId} left room: ${chatRoomId} from disconnected`);
}

const markMessageAsRead = async (message, io) => {
    await chatRoomDB.updateOne(
        {
            chatRoomId: message?.chatRoomId,
            chatId: message?.chatId,
            messageId: message?.messageId
        },
        { status: 'READ' },
        { new: true }
    )

    io.emit('markMessageAsRead', message)
}

// const sendMessage = async (message, io, socket, client) => {
//     const newChatRoom = new chatRoomDB({
//         chatId: message?.chatId,
//         chatRoomId: message?.chatRoomId,
//         messageId: message?.latestMessage?.messageId,
//         senderUserId: message?.latestMessage?.senderUserId,
//         messageType: message?.latestMessage?.messageType,
//         textMessage: message?.latestMessage?.textMessage,
//         latestMessageTimestamp: message?.latestMessage?.latestMessageTimestamp,
//         status: message?.latestMessage?.status
//     })
//     await newChatRoom.save()
    
//     const chatsCurrently = await chatsDB.findOne({
//         chatRoomId: message?.chatRoomId,
//         chatId: message?.chatId
//     })

//     const secondUserId = Object?.keys(chatsCurrently?.unreadCount)?.filter(id => id !== message?.latestMessage?.senderUserId)?.[0]
//     const currentUnreadCountSecondUser = chatsCurrently?.unreadCount?.[secondUserId]

//     const isSecondUserInRoom = await isUserInRoom(
//         message?.chatId,
//         message?.chatRoomId,
//         secondUserId,
//         client
//     )

//     const newUnreadCount = () => {
//         return {
//             [`${message?.latestMessage.senderUserId}`]: 0,
//             [`${secondUserId}`]: isSecondUserInRoom === true ? 0 : currentUnreadCountSecondUser + 1
//         }
//     }
//     await chatsDB.updateOne(
//         {
//             chatRoomId: message?.chatRoomId,
//             chatId: message?.chatId
//         },
//         {
//             unreadCount: newUnreadCount(),
//             latestMessage: message?.latestMessage,
//             latestMessageTimestamp: message?.latestMessage?.latestMessageTimestamp
//         },
//         { new: true }
//     )

//     // send back to the client for new message information
//     io.emit('newMessage', {
//         ...message,
//         unreadCount: newUnreadCount()
//     });
// }

const sendMessage = async (message, io, socket, client) => {
    const { latestMessage } = message;
    const headerText = formatDate(latestMessage?.latestMessageTimestamp);
  
    const headerId = `header-${headerText}`;
    const chatRoomId = message?.chatRoomId;
    const chatId = message?.chatId;
  
    // Tambahkan pesan utama
    const newChatRoom = new chatRoomDB({
      chatId,
      chatRoomId,
      messageId: latestMessage?.messageId,
      senderUserId: latestMessage?.senderUserId,
      messageType: latestMessage?.messageType,
      textMessage: latestMessage?.textMessage,
      latestMessageTimestamp: latestMessage?.latestMessageTimestamp,
      status: latestMessage?.status
    });
    await newChatRoom.save();

    // Cek apakah header untuk tanggal ini sudah ada
    const existingHeader = await chatRoomDB.findOne({
        chatRoomId,
        chatId,
        messageId: headerId
    });
    
    if (!existingHeader) {
        const headerMessage = new chatRoomDB({
          chatId,
          chatRoomId,
          messageId: headerId,
          isHeader: true,
          isEndHeader: true,
          headerText,
          latestMessageTimestamp: latestMessage?.latestMessageTimestamp
        });
        await headerMessage.save();
    }
  
    // Update unread count
    const chatsCurrently = await chatsDB.findOne({ chatRoomId, chatId });
    const secondUserId = Object.keys(chatsCurrently?.unreadCount || {}).find(
      (id) => id !== latestMessage?.senderUserId
    );
    const currentUnreadCount = chatsCurrently?.unreadCount?.[secondUserId] || 0;
  
    const isSecondUserInRoom = await isUserInRoom(chatId, chatRoomId, secondUserId, client);
  
    const newUnreadCount = {
      [latestMessage.senderUserId]: 0,
      [secondUserId]: isSecondUserInRoom ? 0 : currentUnreadCount + 1
    };
  
    await chatsDB.updateOne(
      { chatRoomId, chatId },
      {
        unreadCount: newUnreadCount,
        latestMessage,
        latestMessageTimestamp: latestMessage?.latestMessageTimestamp
      },
      { new: true }
    );

    if(!existingHeader){
        const newData = {
            ...message,
            messageId: headerId,
            isHeader: true,
            isEndHeader: true,
            headerText,
            latestMessageTimestamp: latestMessage?.latestMessageTimestamp
        }
        delete newData.latestMessage
        io.emit('newMessage', newData);
    }
  
    io.emit('newMessage', {
      ...message,
      unreadCount: newUnreadCount
    });
};

// const sendMessage = async (message, io, socket, client) => {
//     await chatRoomDB.updateOne(
//         {
//             chatRoomId: message?.chatRoomId,
//             chatId: message?.chatId
//         },
//         { $push: { data: { $each: [message?.latestMessage], $position: 0 } } },
//         { new: true }
//     )
//     const chatsCurrently = await chatsDB.findOne({
//         chatRoomId: message?.chatRoomId,
//         chatId: message?.chatId
//     })

//     const secondUserId = Object?.keys(chatsCurrently?.unreadCount)?.filter(id => id !== message?.latestMessage?.senderUserId)?.[0]
//     const currentUnreadCountSecondUser = chatsCurrently?.unreadCount?.[secondUserId]

//     const isSecondUserInRoom = await isUserInRoom(
//         message?.chatId,
//         message?.chatRoomId,
//         secondUserId,
//         client
//     )

//     const newUnreadCount = () => {
//         return {
//             [`${message?.latestMessage.senderUserId}`]: 0,
//             [`${secondUserId}`]: isSecondUserInRoom === true ? 0 : currentUnreadCountSecondUser + 1
//         }
//     }
//     await chatsDB.updateOne(
//         {
//             chatRoomId: message?.chatRoomId,
//             chatId: message?.chatId
//         },
//         {
//             unreadCount: newUnreadCount(),
//             latestMessage: message?.latestMessage,
//             latestMessageTimestamp: message?.latestMessage?.latestMessageTimestamp
//         },
//         { new: true }
//     )

//     // send back to the client for new message information
//     io.emit('newMessage', {
//         ...message,
//         unreadCount: newUnreadCount()
//     });
// }

const handleGetSendMessage = async (message, io, socket, client) => {
    if (message?.eventType === 'send-message') {
        sendMessage(message, io, socket, client)
    }
}

const chatRoom = {
    handleDisconnected,
    handleGetSendMessage,
    markMessageAsRead
}

module.exports = { chatRoom }