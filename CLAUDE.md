# CLAUDE.md - Coding Assistant Guide

## Build Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run setup` - Generate Prisma client and run migrations
- `npm run deploy` - Deploy Shopify app

## Framework & Libraries
- Remix v2.15.0 with React 18.2.0
- Shopify App Remix v3.7.0 
- Prisma v6.2.1 for database
- Shopify Polaris v12.0.0 for UI components

## Code Style
- TypeScript with strict mode enabled
- Use ES modules (import/export)
- Follow Shopify Polaris component patterns
- Use Remix loaders/actions for data fetching
- Prefer functional components with React hooks
- Authenticate routes with `authenticate.admin`
- Use Prisma client for type-safe database queries

## Project Structure
- Routes in `app/routes/`
- Shopify config in `app/shopify.server.ts`
- Database schema in `prisma/schema.prisma`
- Prisma client in `app/db.server.ts`