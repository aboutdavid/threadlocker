const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
    lockThread: async function (opts) {
        const { thread_id, admin, lock_type, time, reason, channel_id, app } = opts

        await prisma.thread.create({ // Add thread lock to database
            data: {
                id: thread_id,
                admin: admin,
                lock_type: lock_type,
                time: time,
                reason: reason,
                channel: channel_id
            }
        })
        await app.client.chat.postMessage({ // Inform users in the thread that it is locked
            channel: channel_id,
            thread_ts: thread_id,
            text: `🔒 Thread locked by <@${admin}>. Reason: ${reason} (until: ${time.toLocaleString('en-US', { timeZone: 'America/New_York', timeStyle: "short", dateStyle: "long" })} EST)`,

        })
        await app.client.reactions.add({ // Add lock reaction
            channel: channel_id,
            name: "lock",
            timestamp: thread_id
        })
    },
    unlockThread: async function (opts) {
        const { app, thread_id, channel_id, reason } = opts.app // Pass this through
        if (!thread_id) throw new Error("no thread silly")
        await prisma.thread.delete({ // Delete record from database
            where: {
                id: thread_id
            }
        })
        await app.client.chat.postMessage({ // Inform users in the thread that it is unlocked
            channel: channel_id,
            thread_ts: thread_id,
            text: reason
        })
        await app.client.reactions.remove({ // Remove lock reaction
            channel: channel_id,
            name: "lock",
            timestamp: thread_id
        })
    }
}