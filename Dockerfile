FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

# Tambahkan --ignore-scripts agar postinstall (prisma generate) tidak jalan duluan
RUN npm install --legacy-peer-deps --ignore-scripts

# Salin seluruh sisa file project (termasuk folder prisma dan src)
COPY . .

# Jalankan prisma generate dan build TypeScript secara manual di sini
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]