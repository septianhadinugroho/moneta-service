# Gunakan Node.js LTS
FROM node:20-alpine

WORKDIR /app

# Salin package json
COPY package*.json ./

# Instal semua dependencies (termasuk devDependencies agar tsc dan prisma tersedia saat build)
RUN npm install

# Salin seluruh sisa file project
COPY . .

# Jalankan build script (generate prisma & compile typescript ke folder dist)
RUN npm run build

# Ekspos port backend (sesuaikan dengan port express-mu, misal 5000)
EXPOSE 3000

# Jalankan aplikasi dari hasil build (sesuai script "start": "node dist/app.js")
CMD ["npm", "run", "start"]