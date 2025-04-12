# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package.json and lockfile
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build:all

# Production stage
FROM debian:stable

WORKDIR /dist

# Copy only the dist folder from the builder stage
COPY --from=builder /app/dist /dist

# Remove Windows executable
RUN rm /dist/beatrix-telegram-win32-x64.exe

# Expose necessary ports
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE ${PORT}

# Use architecture detection to run the correct binary
CMD if [ "$(uname -m)" = "x86_64" ]; then \
    /dist/beatrix-telegram-linux-x64 ; \
    elif [ "$(uname -m)" = "aarch64" ]; then \
    /dist/beatrix-telegram-linux-arm64 ; \
    else \
    echo "Unsupported architecture: $(uname -m)"; \
    exit 1; \
    fi
