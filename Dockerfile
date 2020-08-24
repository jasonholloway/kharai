FROM node:12

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx tsc

CMD ["node", "out/src/index.js"]

