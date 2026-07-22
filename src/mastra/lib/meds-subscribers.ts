import { getDatabase } from './mongodb'

export type MedsSubscriber = {
    resourceId: string
    threadId: string
}

async function getSubscribersCollection() {
    const db = await getDatabase()
    return db.collection<MedsSubscriber & { type: string }>('subscribers')
}

export async function addMedsSubscriber(subscriber: MedsSubscriber): Promise<void> {
    const collection = await getSubscribersCollection()
    const exists = await collection.findOne({
        type: 'meds',
        resourceId: subscriber.resourceId,
        threadId: subscriber.threadId,
    })
    if (exists) return
    await collection.insertOne({
        type: 'meds',
        ...subscriber,
    } as any)
}

export async function listMedsSubscribers(): Promise<MedsSubscriber[]> {
    const collection = await getSubscribersCollection()
    const docs = await collection.find({ type: 'meds' }).toArray()
    return docs.map(({ _id, type, ...rest }) => rest)
}
