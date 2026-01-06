# SwitchControl

## Overview

SwitchControl is a modern, polished web-based gaming optimization dashboard prototype. It provides a UI-first experience for Windows system tweaks, power plan management, network optimization, and system monitoring. This is a **prototype application** - all optimization actions are simulated and do not make real Windows system changes. The app uses a dark theme with purple/pink accent colors and a clean gamer aesthetic.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight router)
- **Styling**: Tailwind CSS v4 with custom dark theme and CSS variables
- **UI Components**: shadcn/ui component library (Radix UI primitives)
- **State Management**: Zustand with localStorage persistence for client-side state
- **Data Fetching**: TanStack Query (React Query) for server state
- **Animations**: Framer Motion with reduced motion support
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Replit Auth integration (OpenID Connect)
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session storage
- **API Pattern**: RESTful JSON APIs under `/api/*` prefix

### Data Storage
- **Primary Database**: PostgreSQL (via Drizzle ORM)
- **Client Persistence**: localStorage for UI state (tweaks, history, AI scan results)
- **Schema Location**: `shared/schema.ts` for main app tables, `shared/models/auth.ts` for auth tables

### Key Data Models
- `userSettings`: User preferences, account tier, optimization counters
- `appliedTweaks`: Tracks which system tweaks are enabled per user
- `historyEntries`: Log of all simulated optimization actions
- `aiScans`: Stores AI advisor scan results and recommendations
- `users/sessions`: Replit Auth user and session data

### Application Structure
```
client/src/
├── components/     # React components (dashboard, layout, tweaks, ui)
├── hooks/          # Custom React hooks
├── lib/            # Utilities, API client, mock data, state store
├── pages/          # Route page components
└── config/         # App configuration (social links, etc.)

server/
├── index.ts        # Express server entry point
├── routes.ts       # API route definitions
├── storage.ts      # Database storage interface
├── db.ts           # Database connection
└── replit_integrations/auth/  # Replit Auth integration

shared/
├── schema.ts       # Drizzle database schema
└── models/auth.ts  # Auth-related tables
```

### Key Features by Page
- **Dashboard**: System stats, RAM clearing simulation, AI advisor scan, live telemetry graphs
- **Tweaks**: Categorized system optimization toggles with search, filters, and info modals
- **Network Tweaks**: SMB, TCP/IP, UDP, DNS, and Security network optimizations
- **Power Plan**: Power profile selection with custom overrides
- **History**: Action log with JSON export capability
- **Settings**: Account preferences and app configuration

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle Kit**: Database migrations in `./migrations` directory

### Authentication
- **Replit Auth**: OpenID Connect integration for user authentication
- Required environment variables: `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`

### Third-Party Libraries
- **Recharts**: Data visualization for live telemetry graphs
- **date-fns**: Date formatting utilities
- **Zod**: Schema validation for API requests
- **Framer Motion**: Animation library

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal`: Development error overlay
- `@replit/vite-plugin-cartographer`: Development tooling
- `@replit/vite-plugin-dev-banner`: Development banner

### External Links
- Discord community link
- TikTok social link

### Notes
- All system optimization actions are **simulated** - no real Windows registry or system changes occur
- The "Requires local agent" badge indicates features that would need a native Windows component in production
- Database schema uses UUIDs generated via PostgreSQL's `gen_random_uuid()`