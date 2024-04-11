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
    async function autoUnlock() {
        // Automatic unlocking, checks database once per minute
        const threads = await prisma.thread.findMany({
            where: {
                time: {
                    lte: new Date()
                }
            }
        })
        threads.forEach(async thread => {
            await app.client.chat.postMessage({ // Inform the user that the thread is currently locked. Do this first because deleting the message may not work.
                channel: thread.channel,
                thread_ts: thread.id,
                text: "🔓 Thread unlocked as enough time has passed."
            })

            await app.client.reactions.remove({ // Remove lock reaction
                channel: thread.channel,
                name: "lock",
                timestamp: thread.id
            })
            await prisma.thread.delete({ // Delete record from database
                where: {
                    id: thread.id
                }
            })

        })
    }
    setInterval(autoUnlock, 1000 * 60)
    app.view('lock_modal', async ({ view, ack, body }) => {
        const thread_id = view.blocks.find(block => block.type == "section" && block.fields && block.fields[0].text.includes("Thread ID: ")).fields[0].text.replace("Thread ID: ", "")
        const channel_id = view.blocks.find(block => block.type == "section" && block.fields && block.fields[0].text.includes("Channel ID: ")).fields[0].text.replace("Channel ID: ", "") // this is so bad lol
        // hopefully there is a better way of getting these two values
        const submittedValues = view.state.values
        var reason, expires;

        for (let key in submittedValues) {
            if (submittedValues[key]['plain_text_input-action']) reason = submittedValues[key]['plain_text_input-action'].value
            if (submittedValues[key]['datetimepicker-action']) expires = new Date(submittedValues[key]['datetimepicker-action'].selected_date_time * 1000)
        }

        if (!reason) return await ack({
            "response_action": "errors",
            errors: {
                "datetimepicker-action": "Time cannot be in the past."
            }
        });
        if (new Date() > expires) return await ack({
            "response_action": "errors",
            errors: {
                "datetimepicker-action": "Time cannot be in the past."
            }
        });
        await ack()

        await prisma.thread.create({ // Add thread lock to database
            data: {
                id: thread_id,
                admin: body.user.id,
                lock_type: "test",
                time: expires,
                reason,
                channel: channel_id
            }
        })
        await app.client.chat.postMessage({ // Inform users in the thread that it is locked
            channel: channel_id,
            thread_ts: thread_id,
            text: `🔒 Thread locked by <@${body.user.id}>. Reason: ${reason} (until: ${expires.toLocaleString('en-US', { timeZone: 'America/New_York', timeStyle: "short", dateStyle: "long" })} EST)`,

        })
        await app.client.reactions.add({ // Add lock reaction
            channel: channel_id,
            name: "lock",
            timestamp: thread_id
        })
    });

    app.message(/.*/gim, async ({ message, say, body, }) => { // Listen for all messages (/.*/gim is a regex)

        if (!message.thread_ts) return // Return if not a thread
        const thread = await prisma.thread.findFirst({
            where: {
                id: message.thread_ts
            }
        }) // Lookup and see if the thread is locked in the dataase
        try {
            if (thread && thread.time > new Date()) {

                await app.client.chat.postEphemeral({ // Inform the user that the thread is currently locked. Do this first because deleting the message may not work.
                    user: message.user,
                    channel: message.channel,
                    thread_ts: message.thread_ts,
                    text: `Please don't post here and delete your message. The thread is currently locked until ${thread.time.toLocaleString('en-US', { timeZone: 'America/New_York', timeStyle: "short", dateStyle: "long" })} EST`
                })

                await app.client.chat.delete({ // Delete the chat message 
                    channel: message.channel,
                    ts: message.ts
                })
            } else if (thread && thread.time < new Date()) {
                await app.client.chat.postMessage({ // Inform the user that the thread is currently locked. Do this first because deleting the message may not work.
                    channel: message.channel,
                    thread_ts: message.thread_ts,
                    text: "🔓 Thread unlocked as enough time has passed."
                })
                await prisma.thread.delete({ // Delete record from database
                    where: {
                        id: message.thread_ts
                    }
                })

                await app.client.reactions.remove({ // Remove lock reaction
                    channel: message.channel,
                    name: "lock",
                    timestamp: message.thread_ts
                })
            }
        } catch (e) {
            // Insufficent permissions, most likely.
            // An admin MUST authorise the bot.
            console.error(e)

        }

    });

    app.shortcut('lock_thread', async ({ ack, body, say, client }) => { // This listens for the "lock thread shortcut"
        if (!body.message.thread_ts) return ack("❌ This is not a thread")  // Return if not a thread
        await ack(); // Let slack know we got the request. This is required.

        const thread = await prisma.thread.findFirst({ // Look up in the database if it exists
            where: {
                id: body.message.thread_ts
            }
        })
        if (!thread) {
            var modal = require("./utils/modal.json")
            modal.blocks.push({
                "type": "section",
                "fields": [
                    {
                        "type": "plain_text",
                        "text": `Thread ID: ${body.message.thread_ts}`,
                        "emoji": true
                    }
                ]
            },
                {
                    "type": "section",
                    "fields": [
                        {
                            "type": "plain_text",
                            "text": `Channel ID: ${body.channel.id}`,
                            "emoji": true
                        }
                    ]
                })
            return await client.views.open({
                trigger_id: body.trigger_id,
                view: { ...require("./utils/modal.json"), callback_id: "lock_modal" }
            })
        }
        else {
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
        return
    })


    await app.start();
    console.log('⚡️ Bolt app is running!');
    await autoUnlock()

})();

