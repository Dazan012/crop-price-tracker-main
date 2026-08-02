import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    url: 'postgresql://postgres:Awesomekid%402005%24%24@db.wdhgasdqtkxrhloyofit.supabase.co:5432/postgres',
  },
})
