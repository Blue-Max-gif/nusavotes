import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const voters = pgTable("nusa_voters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  full_name: text("full_name").notNull(),
  phone: text("phone").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const candidates = pgTable("nusa_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("General"),
  photo_url: text("photo_url"),
  created_at: timestamp("created_at").defaultNow(),
});

export const votes = pgTable("nusa_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  voter_id: varchar("voter_id").notNull(),
  candidate_id: varchar("candidate_id").notNull(),
  vote_count: integer("vote_count").notNull().default(1),
  status: text("status").notNull().default("pending"),
  payment_id: varchar("payment_id"),
  created_at: timestamp("created_at").defaultNow(),
});

export const payments = pgTable("nusa_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  voter_id: varchar("voter_id").notNull(),
  total_votes: integer("total_votes").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  payment_status: text("payment_status").notNull().default("pending"),
  mpesa_checkout_request_id: text("mpesa_checkout_request_id"),
  mpesa_merchant_request_id: text("mpesa_merchant_request_id"),
  mpesa_receipt: text("mpesa_receipt"),
  phone: text("phone").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertVoterSchema = createInsertSchema(voters).omit({ id: true, created_at: true });
export const insertCandidateSchema = createInsertSchema(candidates).omit({ id: true, created_at: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, created_at: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, created_at: true });

export type Voter = typeof voters.$inferSelect;
export type InsertVoter = z.infer<typeof insertVoterSchema>;

export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;

export type Vote = typeof votes.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type CandidateWithVotes = Candidate & { total_votes: number };
export type VoteSelection = { candidate_id: string; vote_count: number };

export type User = { id: string; username: string; password: string };
export type InsertUser = { username: string; password: string };
