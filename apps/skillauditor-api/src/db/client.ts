import mongoose from 'mongoose'

let isConnected = false
let connectionAttemptInFlight: Promise<void> | null = null

export function getDbStatus(): 'connected' | 'connecting' | 'disconnected' {
  if (isConnected) return 'connected'
  if (connectionAttemptInFlight) return 'connecting'
  return 'disconnected'
}

export async function connectDb(): Promise<void> {
  if (isConnected) return
  if (connectionAttemptInFlight) return connectionAttemptInFlight

  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  connectionAttemptInFlight = mongoose
    .connect(uri, {
      dbName: 'skillauditor',
      serverSelectionTimeoutMS: 5_000,
    })
    .then(() => {
      isConnected = true
      console.log('Connected to MongoDB')
    })
    .finally(() => {
      connectionAttemptInFlight = null
    })

  await connectionAttemptInFlight
}

export async function closeDb(): Promise<void> {
  await mongoose.disconnect()
  isConnected = false
  connectionAttemptInFlight = null
}
