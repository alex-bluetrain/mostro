import { getDatabase } from './mongodb'

export type DiapersSubscriber = {
    resourceId: string
    threadId: string
}

async function getSubscribersCollection() {
    const db = await getDatabase()
    return db.collection<DiapersSubscriber & { type: string }>('subscribers')
}

export async function addSubscriber(subscriber: DiapersSubscriber): Promise<void> {
    const collection = await getSubscribersCollection()
    const exists = await collection.findOne({
        type: 'diapers',
        resourceId: subscriber.resourceId,
        threadId: subscriber.threadId,
    })
    if (exists) return
    await collection.insertOne({
        type: 'diapers',
        ...subscriber,
    } as any)
}

export async function listSubscribers(): Promise<DiapersSubscriber[]> {
    const collection = await getSubscribersCollection()
    const docs = await collection.find({ type: 'diapers' }).toArray()
    return docs.map(({ _id, type, ...rest }) => rest)
}
