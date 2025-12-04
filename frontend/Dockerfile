FROM node:18-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (with caching)
RUN npm install --prefer-offline --no-audit

# Development stage
FROM base AS development

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start dev server
CMD ["npm", "start"]

# Production build stage
FROM base AS builder

# Copy application code
COPY . .

# Build the application (CI=false to not treat warnings as errors)
ENV CI=false
RUN npm run build

# Production stage - serve with lightweight server
FROM node:18-alpine AS production

WORKDIR /app

# Install serve to run the production build
RUN npm install -g serve

# Copy built assets from builder stage
COPY --from=builder /app/build ./build

# Expose port
EXPOSE 3000

# Serve the production build
CMD ["serve", "-s", "build", "-l", "3000"]

