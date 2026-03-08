import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql, desc } from "drizzle-orm";
import pkg from "pg";
const { Pool } = pkg;
import {
  voters, candidates, votes, payments,
  type Voter, type InsertVoter,
  type Candidate, type InsertCandidate,
  type Vote, type InsertVote,
  type Payment, type InsertPayment,
  type CandidateWithVotes,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export interface IStorage {
  // Voters
  getVoter(id: string): Promise<Voter | undefined>;
  getVoterByPhone(phone: string): Promise<Voter | undefined>;
  createVoter(voter: InsertVoter): Promise<Voter>;

  // Candidates
  getCandidates(): Promise<CandidateWithVotes[]>;
  getCandidate(id: string): Promise<Candidate | undefined>;

  // Votes
  createVotes(voteItems: InsertVote[]): Promise<Vote[]>;
  getVotesByPaymentId(paymentId: string): Promise<Vote[]>;
  markVotesPaid(paymentId: string): Promise<void>;

  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | undefined>;
  updatePaymentStatus(id: string, status: string, receipt?: string): Promise<Payment | undefined>;
  updatePaymentCheckoutId(id: string, checkoutRequestId: string, merchantRequestId: string): Promise<void>;
}

export class DbStorage implements IStorage {
  async getVoter(id: string): Promise<Voter | undefined> {
    const [voter] = await db.select().from(voters).where(eq(voters.id, id));
    return voter;
  }

  async getVoterByPhone(phone: string): Promise<Voter | undefined> {
    const [voter] = await db.select().from(voters).where(eq(voters.phone, phone));
    return voter;
  }

  async createVoter(voter: InsertVoter): Promise<Voter> {
    const [created] = await db.insert(voters).values(voter).returning();
    return created;
  }

  async getCandidates(): Promise<CandidateWithVotes[]> {
    const result = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        description: candidates.description,
        category: candidates.category,
        photo_url: candidates.photo_url,
        created_at: candidates.created_at,
        total_votes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.status} = 'paid' THEN ${votes.vote_count} ELSE 0 END), 0)::int`,
      })
      .from(candidates)
      .leftJoin(votes, eq(candidates.id, votes.candidate_id))
      .groupBy(candidates.id)
      .orderBy(desc(sql`COALESCE(SUM(CASE WHEN ${votes.status} = 'paid' THEN ${votes.vote_count} ELSE 0 END), 0)`));
    return result as CandidateWithVotes[];
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async createVotes(voteItems: InsertVote[]): Promise<Vote[]> {
    if (voteItems.length === 0) return [];
    const created = await db.insert(votes).values(voteItems).returning();
    return created;
  }

  async getVotesByPaymentId(paymentId: string): Promise<Vote[]> {
    return db.select().from(votes).where(eq(votes.payment_id, paymentId));
  }

  async markVotesPaid(paymentId: string): Promise<void> {
    await db
      .update(votes)
      .set({ status: "paid" })
      .where(eq(votes.payment_id, paymentId));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.mpesa_checkout_request_id, checkoutRequestId));
    return payment;
  }

  async updatePaymentStatus(id: string, status: string, receipt?: string): Promise<Payment | undefined> {
    const [updated] = await db
      .update(payments)
      .set({ payment_status: status, ...(receipt ? { mpesa_receipt: receipt } : {}) })
      .where(eq(payments.id, id))
      .returning();
    return updated;
  }

  async updatePaymentCheckoutId(id: string, checkoutRequestId: string, merchantRequestId: string): Promise<void> {
    await db
      .update(payments)
      .set({ mpesa_checkout_request_id: checkoutRequestId, mpesa_merchant_request_id: merchantRequestId })
      .where(eq(payments.id, id));
  }
}

export const storage = new DbStorage();
