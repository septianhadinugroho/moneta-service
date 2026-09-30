FROM node:22-alpine

WORKDIR /app

# Tambahkan baris ini untuk menginstal OpenSSL yang dibutuhkan Prisma di Alpine
RUN apk add --no-cache openssl

COPY package*.json ./

RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]