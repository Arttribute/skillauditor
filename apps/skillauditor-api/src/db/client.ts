import mongoose from 'mongoose'

let isConnected = false

export async function connectDb(): Promise<void> {
  if (isConnected) return

  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  await mongoose.connect(uri, { dbName: 'skillauditor' })
  isConnected = true
  console.log('Connected to MongoDB')
}

export async function closeDb(): Promise<void> {
  await mongoose.disconnect()
  isConnected = false
}
