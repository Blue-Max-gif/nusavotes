import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import axios from "axios";
import { storage } from "./storage";
import { insertVoterSchema } from "@shared/schema";
import { z } from "zod";

function getPaylorBaseUrl() {
  return process.env.PAYLOR_BASE_URL || "https://apipaylor.webnixke.com/api/v1";
}

function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\s+/g, "");
  if (normalized.startsWith("0")) normalized = "254" + normalized.slice(1);
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  return normalized;
}

const submitVotesSchema = z.object({
  voter_id: z.string(),
  selections: z.array(z.object({
    candidate_id: z.string(),
    vote_count: z.number().int().min(1),
  })).min(1),
  phone: z.string(),
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // GET /api/candidates
  app.get("/api/candidates", async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getCandidates());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/voters
  app.post("/api/voters", async (req: Request, res: Response) => {
    try {
      const parsed = insertVoterSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
      const voter = await storage.createVoter(parsed.data);
      res.json(voter);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/votes/session - submit votes + initiate payment
  app.post("/api/votes/session", async (req: Request, res: Response) => {
    try {
      const parsed = submitVotesSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

      const { voter_id, selections, phone } = parsed.data;
      const totalVotes = selections.reduce((sum, s) => sum + s.vote_count, 0);
      const amount = totalVotes * 10;

      // Create payment record
      const payment = await storage.createPayment({
        voter_id,
        total_votes: totalVotes,
        amount: amount.toString(),
        payment_status: "pending",
        phone,
      });

      // Create vote records
      const voteItems = selections.map(s => ({
        voter_id,
        candidate_id: s.candidate_id,
        vote_count: s.vote_count,
        status: "pending",
        payment_id: payment.id,
      }));
      await storage.createVotes(voteItems);

      // Attempt Paylor STK Push
      try {
        const apiKey = process.env.PAYLOR_API_KEY;
        const channelId = process.env.PAYLOR_CHANNEL_ID;
        if (!apiKey || !channelId) {
          return res.json({
            payment_id: payment.id,
            total_votes: totalVotes,
            amount,
            status: "credentials_missing",
            message: "Paylor API key or channel ID not configured. Votes recorded, payment pending.",
          });
        }

        const normalizedPhone = normalizePhone(phone);
        const callbackUrl = process.env.PAYLOR_CALLBACK_URL 
          ? `${process.env.PAYLOR_CALLBACK_URL}/api/payments/callback`
          : `${req.protocol}://${req.get("host")}/api/payments/callback`;
        const paylorRes = await axios.post(
          `${getPaylorBaseUrl()}/merchants/payments/stk-push`,
          {
            phone: normalizedPhone,
            amount: Math.ceil(amount),
            reference: `NUSA-${payment.id}`,
            channelId,
            callbackUrl,
            description: `NUSA Awards votes: ${totalVotes}`,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        const transactionId = paylorRes.data.transactionId || paylorRes.data.transaction_id || "";
        await storage.updatePaymentCheckoutId(payment.id, transactionId, transactionId);

        return res.json({
          payment_id: payment.id,
          checkout_request_id: transactionId,
          total_votes: totalVotes,
          amount,
          status: "stk_pushed",
          message: "STK Push sent. Check your phone to complete payment.",
        });
      } catch (paylorErr: any) {
        return res.json({
          payment_id: payment.id,
          total_votes: totalVotes,
          amount,
          status: "stk_failed",
          message: `STK Push error: ${paylorErr?.response?.data?.message || paylorErr.message || "Unknown"}`,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/callback - M-Pesa webhook
  app.post("/api/payments/callback", async (req: Request, res: Response) => {
    try {
      const event = req.body?.event;
      const transaction = req.body?.transaction;
      if (!event || !transaction) return res.status(400).json({ error: "Invalid payload" });

      const transactionId = transaction.id;
      const payment = await storage.getPaymentByCheckoutRequestId(transactionId);
      if (!payment) return res.status(404).json({ error: "Payment not found" });

      if (event === "payment.success" || transaction.status === "COMPLETED") {
        await storage.updatePaymentStatus(payment.id, "paid", transaction.providerRef || transactionId);
        await storage.markVotesPaid(payment.id);
      } else {
        await storage.updatePaymentStatus(payment.id, "failed");
      }

      res.json({ received: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/payments/:id
  app.get("/api/payments/:id", async (req: Request, res: Response) => {
    try {
      const paymentId = String(req.params.id);
      const payment = await storage.getPayment(paymentId);
      if (!payment) return res.status(404).json({ error: "Not found" });
      res.json(payment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/:id/verify
  app.post("/api/payments/:id/verify", async (req: Request, res: Response) => {
    try {
      const paymentId = String(req.params.id);
      const payment = await storage.getPayment(paymentId);
      if (!payment) return res.status(404).json({ error: "Not found" });
      if (payment.payment_status === "paid") return res.json({ status: "paid", payment });
      if (!payment.mpesa_checkout_request_id) return res.json({ status: payment.payment_status, payment });

      try {
        const apiKey = process.env.PAYLOR_API_KEY;
        if (!apiKey || !payment.mpesa_checkout_request_id) {
          return res.json({ status: payment.payment_status, payment });
        }

        const transactionId = payment.mpesa_checkout_request_id;
        const queryRes = await axios.get(
          `${getPaylorBaseUrl()}/merchants/payments/transactions/${transactionId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        const tx = queryRes.data || {};
        if (tx.status === "COMPLETED" || tx.status === "SUCCESS") {
          await storage.updatePaymentStatus(payment.id, "paid", tx.providerRef || transactionId);
          await storage.markVotesPaid(payment.id);
          return res.json({ status: "paid", payment: await storage.getPayment(payment.id) });
        }

        return res.json({ status: "pending", payment });
      } catch (err: any) {
        return res.json({ status: payment.payment_status, payment });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
