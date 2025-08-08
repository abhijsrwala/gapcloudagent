FROM node:20-alpine

# Accept the env var at build time
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Set working directory
WORKDIR /app

# Copy the entire monorepo
COPY . ./

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies for the monorepo
RUN npm install

# Install Turbo globally
RUN npm install -g turbo

# Build the Next.js application
# The NEXT_PUBLIC_APP_URL will now be available during build
RUN cd apps/sim && npm run build

# Generate database schema for sim app
RUN cd apps/sim && npx drizzle-kit generate

EXPOSE 3000

# Run migrations and start the app
CMD cd apps/sim && npx drizzle-kit push && cd ../.. && npm run dev
