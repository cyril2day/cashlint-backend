import { PrismaClient, User } from '@/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const adapter = new PrismaMariaDb({
  host: 'localhost',
  port: 3306,
  user: 'cashlint_user',
  password: 'cashlint_password',
  database: 'cashlint',
  connectionLimit: 5
})

export const prisma = new PrismaClient( { adapter })