import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3710, host: true }, // host: les téléphones de la maison rejoignent via http://<ip-du-mac>:3710
})
