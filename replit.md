# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Full-stack online learning platform for Flash and Decoding (فلاش و الديكوداج) phone repair courses.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + wouter (routing) + framer-motion (animations)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: JWT (jsonwebtoken), bcryptjs for password hashing
- **Build**: esbuild (CJS bundle for API), Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   └── web/                # React frontend (Vite, previewPath: /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (seed, etc.)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

- **users**: id, username, email, passwordHash, accountType (normal/vip), subscriptionType (demo/annual/lifetime), subscriptionExpiresAt, ipAddress, isActive, createdAt
- **admins**: id, username, passwordHash, createdAt
- **categories**: id, name, slug, icon, createdAt (phone brands: Samsung, iPhone, Huawei, etc.)
- **videos**: id, title, description, thumbnailUrl, driveEmbedUrl, categoryId, isVipOnly, isVisible, createdAt
- **subscription_plans**: id, type (demo/annual/lifetime), price, description, durationDays, createdAt
- **visit_logs**: id, userId, path, ip, visitedAt

## Auth System

- User auth: JWT tokens, IP restriction (one IP per account)
- Admin auth: Separate JWT with admin-specific middleware
- Admin credentials: username=`admin`, password=`admin123`
- Admin login uses `email` field as username lookup

## API Routes (mounted at /api)

- `POST /auth/register` - User registration
- `POST /auth/login` - User login (with IP binding)
- `POST /auth/admin-login` - Admin login
- `GET /auth/me` - Get current user profile
- `POST /auth/change-password` - Change user password
- `GET /videos` - List videos (auth required)
- `GET /videos/:id` - Get single video (auth required, VIP check)
- `GET /categories` - List categories (public)
- `GET /subscription-plans` - List plans (public)
- `GET /admin/stats` - Dashboard stats
- `GET/PUT /admin/users` - User management
- `POST /admin/users/:id/reset-ip` - Reset user IP
- `GET/POST/PUT/DELETE /admin/videos` - Video CRUD
- `GET/POST/PUT/DELETE /admin/categories` - Category CRUD
- `GET/POST/PATCH/DELETE /admin/playlists` - Playlist CRUD
- `GET /playlists` - Public playlist list
- `GET /playlists/:id` - Public playlist detail with videos
- `GET/PUT /admin/subscription-plans` - Plan management

## Frontend Pages

- `/` - Homepage with hero, features, categories, pricing
- `/login` - User login
- `/register` - User registration
- `/videos` - Video library with search, category filter, and Playlists tab
- `/videos/:id` - Video detail with playlist sidebar and prev/next navigation
- `/dashboard` - User profile and subscription info
- `/admin/login` - Admin login
- `/admin` - Admin dashboard with stats and charts
- `/admin/users` - User management (edit, IP reset)
- `/admin/videos` - Video CRUD (with playlist assignment + part number)
- `/admin/categories` - Category CRUD
- `/admin/playlists` - Playlist/Series management (CRUD, video grouping)
- `/admin/plans` - Subscription plan management

## Design

- Dark theme with orange primary color (HSL 28 96% 53%)
- RTL Arabic layout with Tajawal font
- Glass morphism cards, gradient accents
- Framer Motion animations

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API dev server
- `pnpm --filter @workspace/web run dev` — run frontend dev server
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/scripts run seed` — seed database with initial data
