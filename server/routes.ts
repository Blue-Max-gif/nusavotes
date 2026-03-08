import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import axios from "axios";
import { storage } from "./storage";
import { insertVoterSchema } from "@shared/schema";
import { z } from "zod";

async function getMpesaAccessToken(): Promise<string> {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error("M-Pesa credentials not configured");
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  return response.data.access_token;
}

function getTimestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
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

      // Attempt STK Push
      try {
        const token = await getMpesaAccessToken();
        const shortcode = process.env.MPESA_SHORTCODE!;
        const passkey = process.env.MPESA_PASSKEY!;
        const timestamp = getTimestamp();
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

        let normalizedPhone = phone.replace(/\s+/g, "");
        if (normalizedPhone.startsWith("0")) normalizedPhone = "254" + normalizedPhone.slice(1);
        else if (normalizedPhone.startsWith("+")) normalizedPhone = normalizedPhone.slice(1);

        const host = (req.headers.host || "localhost:5000").replace("localhost", "0.0.0.0");
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const callbackUrl = `${protocol}://${host}/api/payments/callback`;

        const stkRes = await axios.post(
          "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
          {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.ceil(amount),
            PartyA: normalizedPhone,
            PartyB: shortcode,
            PhoneNumber: normalizedPhone,
            CallBackURL: callbackUrl,
            AccountReference: "NUSA-AWARDS",
            TransactionDesc: `NUSA Awards: ${totalVotes} vote${totalVotes > 1 ? "s" : ""}`,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const { CheckoutRequestID, MerchantRequestID } = stkRes.data;
        await storage.updatePaymentCheckoutId(payment.id, CheckoutRequestID, MerchantRequestID);

        return res.json({
          payment_id: payment.id,
          checkout_request_id: CheckoutRequestID,
          total_votes: totalVotes,
          amount,
          status: "stk_pushed",
          message: "STK Push sent. Check your phone to complete payment.",
        });
      } catch (mpesaErr: any) {
        const missing = mpesaErr.message === "M-Pesa credentials not configured";
        return res.json({
          payment_id: payment.id,
          total_votes: totalVotes,
          amount,
          status: missing ? "credentials_missing" : "stk_failed",
          message: missing
            ? "M-Pesa credentials not yet configured. Votes recorded, payment pending."
            : `STK Push error: ${mpesaErr.message}`,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/callback - M-Pesa webhook
  app.post("/api/payments/callback", async (req: Request, res: Response) => {
    try {
      const body = req.body?.Body?.stkCallback;
      if (!body) return res.json({ ResultCode: 0 });
      const { CheckoutRequestID, ResultCode, CallbackMetadata } = body;
      const payment = await storage.getPaymentByCheckoutRequestId(CheckoutRequestID);
      if (!payment) return res.json({ ResultCode: 0 });
      if (ResultCode === 0) {
        const items: any[] = CallbackMetadata?.Item || [];
        const receipt = items.find(i => i.Name === "MpesaReceiptNumber")?.Value || "";
        await storage.updatePaymentStatus(payment.id, "paid", receipt);
        await storage.markVotesPaid(payment.id);
      } else {
        await storage.updatePaymentStatus(payment.id, "failed");
      }
      res.json({ ResultCode: 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/payments/:id
  app.get("/api/payments/:id", async (req: Request, res: Response) => {
    try {
      const payment = await storage.getPayment(req.params.id);
      if (!payment) return res.status(404).json({ error: "Not found" });
      res.json(payment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/:id/verify
  app.post("/api/payments/:id/verify", async (req: Request, res: Response) => {
    try {
      const payment = await storage.getPayment(req.params.id);
      if (!payment) return res.status(404).json({ error: "Not found" });
      if (payment.payment_status === "paid") return res.json({ status: "paid", payment });
      if (!payment.mpesa_checkout_request_id) return res.json({ status: payment.payment_status, payment });

      try {
        const token = await getMpesaAccessToken();
        const shortcode = process.env.MPESA_SHORTCODE!;
        const passkey = process.env.MPESA_PASSKEY!;
        const timestamp = getTimestamp();
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
        const queryRes = await axios.post(
          "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
          { BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: payment.mpesa_checkout_request_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (queryRes.data.ResultCode === "0") {
          await storage.updatePaymentStatus(payment.id, "paid");
          await storage.markVotesPaid(payment.id);
          return res.json({ status: "paid", payment: await storage.getPayment(payment.id) });
        }
        return res.json({ status: "pending", payment });
      } catch (_) {
        return res.json({ status: payment.payment_status, payment });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
