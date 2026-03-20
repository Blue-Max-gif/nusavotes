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

    // Seed real candidates if empty
    const count = await this.candidates.countDocuments();
    if (count === 0) {
      const categoriesWithCandidates: Record<string, { name: string; description: string }[]> = {
        "Most Impactful NUSA Patron": [
          { name: "Dr. John Mwangi", description: "Long-serving patron supporting student welfare" },
          { name: "Prof. Jane Wanjiku", description: "Champion of student leadership and mentorship" },
        ],
        "Exemplary Leadership Award": [
          { name: "Brian Otieno", description: "Student leader with outstanding impact" },
          { name: "Mercy Atieno", description: "Led multiple successful student initiatives" },
          { name: "Kevin Kiptoo", description: "Advocated for student rights and unity" },
        ],
        "Mentorship Personality of the Year": [
          { name: "Lucy Njeri", description: "Dedicated mentor to young leaders" },
          { name: "Samuel Ochieng", description: "Guided many students in career growth" },
        ],
        "Chapter Rep of the Year": [
          { name: "Dennis Kariuki", description: "Active and impactful chapter representative" },
          { name: "Faith Akinyi", description: "Strong voice for student concerns" },
          { name: "Peter Mwangi", description: "Consistent and reliable leadership" },
        ],
        "Chapter of the Year": [
          { name: "Egerton Chapter", description: "Most active and impactful chapter" },
          { name: "Nairobi University Chapter", description: "Outstanding community involvement" },
        ],
        "Sportsperson of the Year": [
          { name: "James Kipchoge", description: "Top performer in athletics" },
          { name: "Allan Mutua", description: "Excelled in football competitions" },
          { name: "Victor Wanyama Jr.", description: "Consistent sports excellence" },
          { name: "Kelvin Otieno", description: "Outstanding team player" },
        ],
        "Blogger/Writer of the Year": [
          { name: "Sharon Achieng", description: "Creative and impactful writer" },
          { name: "David Kimani", description: "Top student blogger" },
        ],
        "Outstanding Student with Disability": [
          { name: "Esther Wambui", description: "Inspiring resilience and excellence" },
          { name: "Michael Onyango", description: "Academic and leadership excellence" },
          { name: "Malvin Odallo", description: "Empowering People, Transforming Lives" },
        ],
        "Patrons Award for Academic Excellence": [
          { name: "Grace Wanjiru", description: "Top academic performer" },
          { name: "Daniel Kiprono", description: "Consistently high academic results" },
          { name: "Ruth Chebet", description: "Excellence in research and studies" },
        ],
        "NUSA Alumni of the Year": [
          { name: "Eng. Paul Mutiso", description: "Successful alumnus contributing to society" },
          { name: "Dr. Anne Njeri", description: "Outstanding achievements post-graduation" },
        ],
        "Activist of the Year": [
          { name: "Kevin Ouma", description: "Advocated for student rights" },
          { name: "Brenda Atieno", description: "Led impactful campaigns" },
          { name: "Allan Mwangi", description: "Voice for change and justice" },
        ],
        "Best Student-Led Research Project": [
          { name: "AI Smart Farming Project", description: "Innovative agriculture solution" },
          { name: "Campus Waste Recycling System", description: "Environmental sustainability project" },
          { name: "Health Monitoring App", description: "Tech solution for student health" },
          { name: "Smart Library System", description: "Digital transformation of libraries" },
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