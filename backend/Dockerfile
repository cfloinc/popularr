FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ && npm ci --omit=dev && apk del python3 make g++
COPY src/ src/
COPY public/ public/
ENV PORT=7879
ENV DATA_DIR=/data
EXPOSE 7879
VOLUME /data
CMD ["node", "src/index.js"]
