FROM node:24-alpine
WORKDIR /app

COPY package*.json ./

COPY services/canvas-service/package*.json ./services/canvas-service/
COPY shared/package*.json ./shared/

RUN npm install -w services/canvas-service

COPY . .

EXPOSE 3001
CMD ["npm", "run", "dev", "-w", "services/canvas-service"]