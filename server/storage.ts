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
  getVoter(id: string): Promise<Voter | undefined>;
  getVoterByPhone(phone: string): Promise<Voter | undefined>;
  createVoter(voter: InsertVoter): Promise<Voter>;

  getCandidates(): Promise<CandidateWithVotes[]>;
  getCandidate(id: string): Promise<Candidate | undefined>;

  createVotes(voteItems: InsertVote[]): Promise<Vote[]>;
  getVotesByPaymentId(paymentId: string): Promise<Vote[]>;
  markVotesPaid(paymentId: string): Promise<void>;

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
    const uri = process.env.DATABASE_URL || "mongodb+srv://admin:admin@whatsapp-cluster.38vq8k0.mongodb.net/nusaward";
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

    // Seed real candidates if empty
    const count = await this.candidates.countDocuments();
    if (count === 0) {
     const categoriesWithCandidates: Record<string, { name: string; description: string }[]> = {
  "Best Patron Over Time": [
    { name: "Prof Vincent Onywera (Grade 1)", description: "" },
    { name: "Hon Dr Mathews Owili", description: "" },
  ],

  "Exemplary Leadership Award": [
    { name: "Emmanuel Peter", description: "" },
    { name: "Tobias Osano", description: "" },
    { name: "Leakey Ochieng", description: "" },
    { name: "Gerald Anthony", description: "" },
    { name: "Jemimah Achieng", description: "" },
    { name: "Lé Trécida", description: "" },
  ],

  "Mentorship Personality of the Year": [
    { name: "Jacob Omullo", description: "" },
    { name: "Treicy Adhiambo", description: "" },
    { name: "Shedrian Stacy", description: "" },
    { name: "Joan Akinyi", description: "" },
    { name: "Kris Sheriff", description: "" },
  ],

  "Chapter Rep of the Year": [
    { name: "Normanvince", description: "" },
    { name: "Lé Trécida", description: "" },
    { name: "Nicholas Okoth", description: "" },
    { name: "Maurice Oyombe", description: "" },
    { name: "Robby Ouma", description: "" },
    { name: "Rollince", description: "" },
    { name: "Griffins Okeyo", description: "" },
  ],

  "NUSA Activist of the Year": [
    { name: "David Okuta", description: "" },
    { name: "Ochieng Fidel", description: "" },
    { name: "David Maduva", description: "" },
    { name: "Odhiambo Ezekiel", description: "" },
    { name: "Le Trécida", description: "" },
    { name: "Benard Kisero", description: "" },
  ],

  "Chapter of the Year": [
    { name: "Maseno University", description: "" },
    { name: "MMUST Chapter", description: "" },
    { name: "Moi University", description: "" },
    { name: "Kisii University", description: "" },
    { name: "Kirinyaga University", description: "" },
    { name: "Meru University", description: "" },
    { name: "Mawego Technical", description: "" },
    { name: "JOOUST Chapter", description: "" },
    { name: "Meru University", description: "" },
  ],

  "Blogger of the Year": [
    { name: "Hemstone Otieno", description: "" },
    { name: "Omondi Griffin Otieno", description: "" },
    { name: "Loch Wiye Tek", description: "" },
    { name: "Betty Bash", description: "" },
    { name: "Pachi e Pacha", description: "" },
    { name: "Catalyst", description: "" },
    { name: "Hope Kelly", description: "" },
  ],

  "Patron's Award for Academic Excellence": [
    { name: "Roy Emmanuel", description: "" },
    { name: "Ochieng John Guda", description: "" },
    { name: "Rael Oguta", description: "" },
    { name: "Lizza Achieng", description: "" },
    { name: "Ambrose Adwet", description: "" },
  ],

  "NUSA Alumni of the Year": [
    { name: "Juma Vincent (Emeritus Chair)", description: "" },
    { name: "Kevin Okite", description: "" },
    { name: "Steven Obiero", description: "" },
    { name: "Sir Walter Okoth", description: "" },
  ],
};

      const initialCandidates: InsertCandidate[] = Object.entries(categoriesWithCandidates)
        .flatMap(([category, nominees]) =>
          nominees.map(nominee => ({
            name: nominee.name,
            description: nominee.description,
            category,
            photo_url: "",
          }))
        );

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
    return (await this.voters.findOne({ id } as any)) || undefined;
  }

  async getVoterByPhone(phone: string): Promise<Voter | undefined> {
    await this.initialized;
    return (await this.voters.findOne({ phone } as any)) || undefined;
  }

  async createVoter(voter: InsertVoter): Promise<Voter> {
    await this.initialized;
    const newVoter: Voter = { ...voter, id: randomUUID(), created_at: new Date() };
    await this.voters.insertOne(newVoter);
    return newVoter;
  }

  async getCandidates(): Promise<CandidateWithVotes[]> {
    await this.initialized;
    return this.candidates.aggregate([
      {
        $lookup: {
          from: "votes",
          let: { candidateId: "$id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$candidate_id", "$$candidateId"] }, { $eq: ["$status", "paid"] }] } } },
            { $group: { _id: null, total: { $sum: "$vote_count" } } },
          ],
          as: "vote_summary",
        },
      },
      { $addFields: { total_votes: { $ifNull: [{ $arrayElemAt: ["$vote_summary.total", 0] }, 0] } } },
      { $sort: { total_votes: -1 } },
    ]).toArray() as Promise<CandidateWithVotes[]>;
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    await this.initialized;
    return (await this.candidates.findOne({ id } as any)) || undefined;
  }

  async createVotes(voteItems: InsertVote[]): Promise<Vote[]> {
    await this.initialized;
    const newVotes = voteItems.map(item => ({ ...item, id: randomUUID(), created_at: new Date() }));
    if (newVotes.length > 0) await this.votes.insertMany(newVotes);
    return newVotes;
  }

  async getVotesByPaymentId(paymentId: string): Promise<Vote[]> {
    await this.initialized;
    return this.votes.find({ payment_id: paymentId } as any).toArray();
  }

  async markVotesPaid(paymentId: string): Promise<void> {
    await this.initialized;
    await this.votes.updateMany({ payment_id: paymentId } as any, { $set: { status: "paid" } });
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    await this.initialized;
    const newPayment: Payment = { ...payment, id: randomUUID(), created_at: new Date() };
    await this.payments.insertOne(newPayment);
    return newPayment;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    await this.initialized;
    return (await this.payments.findOne({ id } as any)) || undefined;
  }

  async getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | undefined> {
    await this.initialized;
    return (await this.payments.findOne({ mpesa_checkout_request_id: checkoutRequestId } as any)) || undefined;
  }

  async updatePaymentStatus(id: string, status: string, receipt?: string): Promise<Payment | undefined> {
    await this.initialized;
    const update: any = { $set: { payment_status: status } };
    if (receipt) update.$set.mpesa_receipt = receipt;
    const result = await this.payments.findOneAndUpdate({ id } as any, update, { returnDocument: "after" });
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