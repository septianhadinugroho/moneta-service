# 1. Gunakan Node.js versi 22 (sesuai kebutuhan package Google terbaru)
FROM node:22-alpine

WORKDIR /app

# 2. Salin package.json terlebih dahulu
COPY package*.json ./

# 3. Instal dependencies
RUN npm install --legacy-peer-deps

# 4. Salin seluruh sisa file project (termasuk folder prisma dan src) SETELAH npm install
COPY . .

# 5. Jalankan build (karena file schema sudah ada di sini, prisma generate akan aman)
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]