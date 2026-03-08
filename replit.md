# NUSA Awards - Online Voting System

## Overview
A full-stack online voting system for NUSA (community organization) that allows users to vote for candidates across multiple award categories. Votes cost KSh 10 each, paid via M-Pesa STK Push.

## Architecture
- **Frontend**: React + TypeScript + Vite, TanStack Query, shadcn/ui components, Wouter routing
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Replit built-in) via Drizzle ORM
- **Payment**: M-Pesa Daraja API (Safaricom) STK Push

## Pages
- `/` - Main voting page: voter registration → candidate selection → payment
- `/results` - Live results page (auto-refreshes every 10 seconds)

## Database Tables
- `nusa_voters` - Voter registrations (name, phone)
- `nusa_candidates` - Award candidates with categories
- `nusa_votes` - Individual vote records (linked to payment)
- `nusa_payments` - Payment records with M-Pesa details

## API Endpoints
- `GET /api/candidates` - All candidates with vote counts
- `POST /api/voters` - Register a voter
- `POST /api/votes/session` - Submit votes + initiate M-Pesa STK Push
- `POST /api/payments/callback` - M-Pesa webhook callback
- `GET /api/payments/:id` - Check payment status
- `POST /api/payments/:id/verify` - Manually verify payment via M-Pesa query API

## Voting Flow
1. User enters name + M-Pesa phone number → creates voter record
2. User selects vote quantities per candidate (unlimited votes, KSh 10 each)
3. On submit: payment record created, votes saved as "pending", STK Push sent
4. M-Pesa callback (or manual verify) marks payment as "paid" → votes become "paid" (counted)

## M-Pesa Configuration
Requires these secrets:
- `MPESA_CONSUMER_KEY` - Daraja API consumer key
- `MPESA_CONSUMER_SECRET` - Daraja API consumer secret
- `MPESA_SHORTCODE` - Business shortcode (paybill/till)
- `MPESA_PASSKEY` - Lipa na M-Pesa passkey

App works without these credentials (votes saved, payment deferred). Add credentials via Replit Secrets.

## Vote Counting
Only "paid" votes count in the live results. Pending votes are stored but not shown in results until payment confirms.
