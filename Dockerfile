FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci
COPY . .
RUN npm run build
ENV LIFEKIT_HOST=0.0.0.0
EXPOSE 4310
VOLUME /app/backend/data
CMD ["npm", "start"]
