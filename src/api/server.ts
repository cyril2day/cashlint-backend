import express from 'express'
import { identityRoutes } from './routes/identity'
import { ledgerRoutes } from './routes/ledger'

const app = express()
app.use(express.json())

// Register context-specific routes
app.use('/api', identityRoutes)
app.use('/api/ledger', ledgerRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server on ${PORT}`))

export { app }