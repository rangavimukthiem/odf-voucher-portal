# ODF Loyalty E-Voucher Portal

An EKAFY-compatible full-stack application (Node.js + Express + MariaDB + SvelteKit) for managing passenger loyalty points, issuing manual 6-digit e-vouchers, and redeeming vouchers at Duty Free cashier counters.

## Core Workflow

1. **Operations / Admin (`admin` role)**:
   - Maintains passenger records (full name, passport number, nationality, contact, and manually calculated loyalty points).
   - Assigns a manually entered **6-digit voucher number** (`000000`–`999999`) with monetary value and optional expiry to a passenger.
   - Manages staff accounts (`admin` and `cashier`), voids un-claimed vouchers, and reviews audit logs.
2. **Duty Free Cashier (`cashier` role)**:
   - Logs in to the Cashier Terminal.
   - Looks up a passenger's **6-digit voucher number**.
   - Verifies passenger identity by entering either the **full passport number** or **last 4 characters** of the passport.
   - Atomically claims the single-use voucher (with optional POS receipt reference).

## Local Development

```bash
# 1. Configure environment
cp .env.example .env

# 2. Install backend + frontend dependencies
npm install --legacy-peer-deps
npm run install:web

# 3. Run backend API (port 3000) and SvelteKit dev server (port 5173)
npm run dev:server
npm run dev:web
```

## Production / EKAFY Build

```bash
npm install --legacy-peer-deps
npm run install:web
npm run build
npm start
```

The container listens on `0.0.0.0:3000` (`process.env.PORT || 3000`) and connects to `ekafy-mariadb`.
