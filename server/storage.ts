import "dotenv/config";
import { MongoClient, type Collection, type Db } from "mongodb";
import { randomUUID } from "crypto";
import {
  type Voter, type InsertVoter,
  type Candidate, type InsertCandidate,
  type Vote, type InsertVote,
  type Payment, type InsertPayment,
  type CandidateWithVotes,
} from "@shared/schema";

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

export class MongoStorage implements IStorage {
  private client: MongoClient;
  private db!: Db;
  private voters!: Collection<Voter>;
  private candidates!: Collection<Candidate>;
  private votes!: Collection<Vote>;
  private payments!: Collection<Payment>;
  private initialized: Promise<void>;

  constructor() {
    const uri = process.env.DATABASE_URL || "mongodb://localhost:27017/nusavotes";
    this.client = new MongoClient(uri);
    this.initialized = this.init();
  }

  private async init() {
    await this.client.connect();
    this.db = this.client.db();
    this.voters = this.db.collection<Voter>("voters");
    this.candidates = this.db.collection<Candidate>("candidates");
    this.votes = this.db.collection<Vote>("votes");
    this.payments = this.db.collection<Payment>("payments");

    // Seed initial candidates if empty
    const count = await this.candidates.countDocuments();
    if (count === 0) {
      const initialCandidates: InsertCandidate[] = [
        { name: "Candidate One", description: "First candidate description", category: "General", photo_url: "" },
        { name: "Candidate Two", description: "Second candidate description", category: "General", photo_url: "" },
      ];
      await Promise.all(initialCandidates.map(c => this.createCandidate(c)));
    }
  }

  private async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const newCandidate: Candidate = {
      ...candidate,
      id: randomUUID(),
      created_at: new Date(),
    };
    await this.candidates.insertOne(newCandidate);
    return newCandidate;
  }

  async getVoter(id: string): Promise<Voter | undefined> {
    await this.initialized;
    const voter = await this.voters.findOne({ id } as any);
    return voter || undefined;
  }

  async getVoterByPhone(phone: string): Promise<Voter | undefined> {
    await this.initialized;
    const voter = await this.voters.findOne({ phone } as any);
    return voter || undefined;
  }

  async createVoter(voter: InsertVoter): Promise<Voter> {
    await this.initialized;
    const newVoter: Voter = {
      ...voter,
      id: randomUUID(),
      created_at: new Date(),
    };
    await this.voters.insertOne(newVoter);
    return newVoter;
  }

  async getCandidates(): Promise<CandidateWithVotes[]> {
    await this.initialized;
    const result = await this.candidates.aggregate([
      {
        $lookup: {
          from: "votes",
          let: { candidateId: "$id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$candidate_id", "$$candidateId"] },
                    { $eq: ["$status", "paid"] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$vote_count" }
              }
            }
          ],
          as: "vote_summary"
        }
      },
      {
        $addFields: {
          total_votes: {
            $ifNull: [{ $arrayElemAt: ["$vote_summary.total", 0] }, 0]
          }
        }
      },
      {
        $sort: { total_votes: -1 }
      }
    ]).toArray();

    return result as CandidateWithVotes[];
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    await this.initialized;
    const candidate = await this.candidates.findOne({ id } as any);
    return candidate || undefined;
  }

  async createVotes(voteItems: InsertVote[]): Promise<Vote[]> {
    await this.initialized;
    const newVotes = voteItems.map(item => ({
      ...item,
      id: randomUUID(),
      created_at: new Date(),
    }));
    if (newVotes.length > 0) {
      await this.votes.insertMany(newVotes);
    }
    return newVotes;
  }

  async getVotesByPaymentId(paymentId: string): Promise<Vote[]> {
    await this.initialized;
    return this.votes.find({ payment_id: paymentId } as any).toArray();
  }

  async markVotesPaid(paymentId: string): Promise<void> {
    await this.initialized;
    await this.votes.updateMany(
      { payment_id: paymentId } as any,
      { $set: { status: "paid" } }
    );
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    await this.initialized;
    const newPayment: Payment = {
      ...payment,
      id: randomUUID(),
      created_at: new Date(),
    };
    await this.payments.insertOne(newPayment);
    return newPayment;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    await this.initialized;
    const payment = await this.payments.findOne({ id } as any);
    return payment || undefined;
  }

  async getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | undefined> {
    await this.initialized;
    const payment = await this.payments.findOne({ mpesa_checkout_request_id: checkoutRequestId } as any);
    return payment || undefined;
  }

  async updatePaymentStatus(id: string, status: string, receipt?: string): Promise<Payment | undefined> {
    await this.initialized;
    const update: any = { $set: { payment_status: status } };
    if (receipt) update.$set.mpesa_receipt = receipt;

    const result = await this.payments.findOneAndUpdate(
      { id } as any,
      update,
      { returnDocument: "after" }
    );
    return result || undefined;
  }

  async updatePaymentCheckoutId(id: string, checkoutRequestId: string, merchantRequestId: string): Promise<void> {
    await this.initialized;
    await this.payments.updateOne(
      { id } as any,
      { $set: { mpesa_checkout_request_id: checkoutRequestId, mpesa_merchant_request_id: merchantRequestId } }
    );
  }
}

export const storage = new MongoStorage();
