# Build stage
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

# Copy package manifests
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy the built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# BusyBox wget is already in nginx:alpine; use 127.0.0.1 (not localhost) to avoid IPv6 ::1 with no listener.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]

# Command to run the server
CMD ["nginx", "-g", "daemon off;"]
