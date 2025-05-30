# syntax=docker.io/docker/dockerfile:1

ARG NODE_VERSION=18.20.0
ARG PNPM_VERSION=9.9.0

FROM node:${NODE_VERSION}-alpine AS base

# Install pnpm and corepack
RUN npm install --global corepack@latest && corepack enable pnpm

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Adding environment variables
ARG PORT_FRONTEND
ARG DATABASE_URL
ARG GITHUB_ID
ARG GITHUB_SECRET
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL
ARG ABLY_API_KEY
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_CLOUDINARY_API_KEY
ARG CLOUDINARY_API_SECRET
ARG REDIS_URL
ARG REDIS_TOKEN

ENV PORT_FRONTEND=${PORT_FRONTEND}
ENV DATABASE_URL=${DATABASE_URL}
ENV GITHUB_ID=${GITHUB_ID}
ENV GITHUB_SECRET=${GITHUB_SECRET}
ENV GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
ENV GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
ENV ABLY_API_KEY=${ABLY_API_KEY}
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}
ENV NEXT_PUBLIC_CLOUDINARY_API_KEY=${NEXT_PUBLIC_CLOUDINARY_API_KEY}
ENV CLOUDINARY_API_SECRET=${CLOUDINARY_API_SECRET}
ENV REDIS_URL=${REDIS_URL}
ENV REDIS_TOKEN=${REDIS_TOKEN}

# Install dependencies
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  if [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=cache,id=pnpm,target=/pnpm/store  \
  if [ -f pnpm-lock.yaml ]; then pnpm install && pnpm run db:generate && pnpm run db:push && pnpm build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Set in compose file
# ENV NODE_ENV=production

# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE ${PORT_FRONTEND}

ENV PORT=${PORT_FRONTEND}

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]