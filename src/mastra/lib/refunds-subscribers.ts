import { getDatabase } from './mongodb'

export type RefundsSubscriber = {
    resourceId: string
    threadId: string
}

async function getSubscribersCollection() {
    const db = await getDatabase()
    return db.collection<RefundsSubscriber & { type: string }>('subscribers')
}

export async function addRefundsSubscriber(subscriber: RefundsSubscriber): Promise<void> {
    const collection = await getSubscribersCollection()
    const exists = await collection.findOne({
        type: 'refunds',
        resourceId: subscriber.resourceId,
        threadId: subscriber.threadId,
    })
    if (exists) return
    await collection.insertOne({
        type: 'refunds',
        ...subscriber,
    } as any)
}

export async function listRefundsSubscribers(): Promise<RefundsSubscriber[]> {
    const collection = await getSubscribersCollection()
    const docs = await collection.find({ type: 'refunds' }).toArray()
    return docs.map(({ _id, type, ...rest }) => rest)
}
