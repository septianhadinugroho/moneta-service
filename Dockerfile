FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./

RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

RUN npx prisma generate
# Tambahkan baris ini untuk memaksa Prisma membuat tabel di database secara otomatis
RUN npx prisma db push

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]