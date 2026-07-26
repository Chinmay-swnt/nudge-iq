FROM node:20-slim

#Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

EXPOSE 4000
CMD ["pnpm", "dev"]