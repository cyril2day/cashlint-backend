import express from 'express'
import { identityRoutes } from './routes/identity'
import { ledgerRoutes } from './routes/ledger'
import { salesRoutes } from './routes/sales'
import { purchasingRoutes } from './routes/purchasing'

const app = express()
app.use(express.json())

// Register context-specific routes
app.use('/api', identityRoutes)
app.use('/api/ledger', ledgerRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/purchasing', purchasingRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server on ${PORT}`))

export { app }