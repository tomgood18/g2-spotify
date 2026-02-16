import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  server: {
    // Changing this to true (or 0.0.0.0) allows your MacBook IP to work
    host: '0.0.0.0', 
    port: 5173,
    // Turn this to true so basicSsl can take over
    https: true 
  }
});