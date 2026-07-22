import { MongoClient } from 'mongodb'
import { appConfig } from '../config/app.config'

let cachedClient: MongoClient | null = null

export async function getMongoClient(): Promise<MongoClient> {
    if (cachedClient) return cachedClient
    cachedClient = new MongoClient(appConfig.MONGODB_URI)
    await cachedClient.connect()
    return cachedClient
}

export async function getDatabase() {
    const client = await getMongoClient()
    return client.db(appConfig.MONGODB_DB_NAME)
}
