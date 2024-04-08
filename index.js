require('dotenv').config()
const { App } = require('@slack/bolt');
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
});


(async () => {
    app.message(/.*/gim, async ({ message, say, body, }) => { // Listen for all messages (/.*/gim is a regex)

        if (!message.thread_ts) return // Return if not a thread
        const thread = await prisma.thread.findFirst({
            where: {
                id: message.thread_ts
            }
        }) // Lookup and see if the thread is locked in the dataase
        try {
            await app.client.chat.postEphemeral({ // Inform the user that the thread is currently locked. Do this first because deleting the message may not work.
                user: message.user,
                channel: message.channel,
                thread_ts: message.thread_ts,
                text: `Please don't post here and delete your message. The thread is currently locked.`
            }) 

            if (thread) await app.client.chat.delete({ // Delete the chat message 
                channel: message.channel,
                ts: message.ts
            }) 
           
        } catch (e) {
            // Insufficent permissions, most likely.
            // An admin MUST authorise the bot.
            console.error(e)
            
        }

    });
    app.shortcut('lock_thread', async ({ ack, body, say }) => { // This listens for the "lock thread shortcut"
        if (!body.message.thread_ts) return ack("❌ This is not a thread")  // Return if not a thread
        await ack(); // Let slack know we got the request. This is required.

        const thread = await prisma.thread.findFirst({ // Look up in the database if it exists
            where: {
                id: body.message.thread_ts
            }
        })
        if (!thread) { // If the thread is not locked, lock it.
            await prisma.thread.create({ // Add thread lock to database
                data: {
                    id: body.message.thread_ts,
                    admin: body.user.id
                }
            })
            await app.client.chat.postMessage({ // Inform users in the thread that it is locked
                channel: body.channel.id,
                thread_ts: body.message.thread_ts,
                text: `🔒 Thread locked by <@${body.user.id}>`,
                
            })
            await app.client.reactions.add({ // Add lock reaction
                channel: body.channel.id,
                name: "lock",
                timestamp: body.message.thread_ts
            })
        }
        else { // If the thread is locked, unlock it.
            await prisma.thread.delete({ // Delete record from database
                where: {
                    id: body.message.thread_ts
                }
            })
            await app.client.chat.postMessage({ // Inform users in the thread that it is unlocked
                channel: body.channel.id,
                thread_ts: body.message.thread_ts,
                text: `🔓 Thread unlocked by <@${body.user.id}>`
            })
            await app.client.reactions.remove({ // Remove lock reaction
                channel: body.channel.id,
                name: "lock",
                timestamp: body.message.thread_ts
            })
        }

    })

    console.log('⚡️ Bolt app is running!');
    await app.start();

})();

