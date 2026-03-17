import { z } from "zod";

export const voterSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  phone: z.string(),
  created_at: z.date().or(z.string()),
});

export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string().default("General"),
  photo_url: z.string().optional().nullable(),
  created_at: z.date().or(z.string()),
});

export const voteSchema = z.object({
  id: z.string(),
  voter_id: z.string(),
  candidate_id: z.string(),
  vote_count: z.number().int().min(1),
  status: z.string().default("pending"),
  payment_id: z.string().optional().nullable(),
  created_at: z.date().or(z.string()),
});

export const paymentSchema = z.object({
  id: z.string(),
  voter_id: z.string(),
  total_votes: z.number().int(),
  amount: z.string(),
  payment_status: z.string().default("pending"),
  mpesa_checkout_request_id: z.string().optional().nullable(),
  mpesa_merchant_request_id: z.string().optional().nullable(),
  mpesa_receipt: z.string().optional().nullable(),
  phone: z.string(),
  created_at: z.date().or(z.string()),
});

export const insertVoterSchema = voterSchema.omit({ id: true, created_at: true });
export const insertCandidateSchema = candidateSchema.omit({ id: true, created_at: true });
export const insertVoteSchema = voteSchema.omit({ id: true, created_at: true });
export const insertPaymentSchema = paymentSchema.omit({ id: true, created_at: true });

export type Voter = z.infer<typeof voterSchema>;
export type InsertVoter = z.infer<typeof insertVoterSchema>;

export type Candidate = z.infer<typeof candidateSchema>;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;

export type Vote = z.infer<typeof voteSchema>;
export type InsertVote = z.infer<typeof insertVoteSchema>;

export type Payment = z.infer<typeof paymentSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type CandidateWithVotes = Candidate & { total_votes: number };
export type VoteSelection = { candidate_id: string; vote_count: number };

export type User = { id: string; username: string; password: string };
export type InsertUser = { username: string; password: string };
