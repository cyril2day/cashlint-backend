import express from 'express'
import { identityRoutes } from '@/api/routes/identity'

const app = express()
app.use(express.json())

// Register context-specific routes
app.use('/api', identityRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server on ${PORT}`))

export { app }