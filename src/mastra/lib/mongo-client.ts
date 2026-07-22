import { MongoClient, type Db } from 'mongodb'
import { appConfig } from '../config/app.config'

let client: MongoClient | null = null

export async function getDb(): Promise<Db> {
    if (!client) {
        client = new MongoClient(appConfig.MONGODB_URI)
        await client.connect()
    }
    return client.db(appConfig.MONGODB_DB_NAME)
}
