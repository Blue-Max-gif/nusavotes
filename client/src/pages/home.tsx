import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Trophy, Vote, Plus, Minus, Phone, User, ChevronRight,
  CheckCircle2, Clock, XCircle, Loader2, BarChart3, Star, Award, Zap, Crown
} from "lucide-react";
import type { CandidateWithVotes } from "@shared/schema";

type VoteSession = {
  payment_id: string;
  checkout_request_id?: string;
  total_votes: number;
  amount: number;
  status: string;
  message: string;
};

type PaymentRecord = {
  id: string;
  payment_status: string;
  total_votes: number;
  amount: string;
  mpesa_receipt?: string;
};

const categoryConfig: Record<string, { color: string; glow: string; icon: typeof Award; label: string }> = {
  "Best Leader": {
    color: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    glow: "ring-amber-500/30",
    icon: Star,
    label: "Best Leader",
  },
  "Innovation Award": {
    color: "text-yellow-300 border-yellow-500/30 bg-yellow-500/10",
    glow: "ring-yellow-400/30",
    icon: Zap,
    label: "Innovation Award",
  },
  "Entrepreneur of the Year": {
    color: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    glow: "ring-orange-400/30",
    icon: Trophy,
    label: "Entrepreneur of Year",
  },
  "General": {
    color: "text-primary border-primary/30 bg-primary/10",
    glow: "ring-primary/30",
    icon: Award,
    label: "General",
  },
};

function CandidateAvatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const gradients = [
    "from-amber-600 to-yellow-400",
    "from-yellow-700 to-amber-500",
    "from-amber-500 to-orange-400",
    "from-yellow-600 to-amber-400",
    "from-orange-600 to-yellow-500",
    "from-amber-700 to-yellow-500",
  ];
  const gi = name.charCodeAt(0) % gradients.length;
  return (
    <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${gradients[gi]} flex items-center justify-center font-bold text-black text-lg flex-shrink-0 shadow-lg`}>
      {initials}
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<"register" | "vote" | "payment" | "confirm">("register");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [voterId, setVoterId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [session, setSession] = useState<VoteSession | null>(null);
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null);
  const [polling, setPolling] = useState(false);

  const { data: candidates = [], isLoading } = useQuery<CandidateWithVotes[]>({
    queryKey: ["/api/candidates"],
  });

  const totalVotes = Object.values(selections).reduce((s, v) => s + v, 0);
  const totalAmount = totalVotes * 10;
  const categories = [...new Set(candidates.map(c => c.category))];
  const maxVotes = candidates.reduce((max, c) => Math.max(max, c.total_votes), 1);

  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = candidates.filter(c => c.category === cat);
    return acc;
  }, {} as Record<string, CandidateWithVotes[]>);

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/voters", { full_name: fullName, phone });
      return res.json();
    },
    onSuccess: (voter) => {
      setVoterId(voter.id);
      setStep("vote");
      toast({ title: "Welcome, " + voter.full_name + "!", description: "Select your candidates and start voting." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not register. Please try again.", variant: "destructive" });
    },
  });

  const submitVotesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/votes/session", {
        voter_id: voterId,
        selections: Object.entries(selections).map(([candidate_id, vote_count]) => ({ candidate_id, vote_count })),
        phone,
      });
      return res.json();
    },
    onSuccess: (data: VoteSession) => {
      setSession(data);
      setStep("payment");
      if (data.status === "stk_pushed") {
        toast({ title: "Check your phone!", description: "M-Pesa prompt sent. Enter your PIN to complete." });
        startPolling(data.payment_id);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit votes.", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await apiRequest("POST", `/api/payments/${paymentId}/verify`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "paid") {
        setPaymentRecord(data.payment);
        setStep("confirm");
        setPolling(false);
        qc.invalidateQueries({ queryKey: ["/api/candidates"] });
        toast({ title: "Payment confirmed!", description: "Your votes have been recorded!" });
      }
    },
  });

  function startPolling(paymentId: string) {
    setPolling(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/payments/${paymentId}`);
        const payment = await res.json();
        if (payment.payment_status === "paid") {
          clearInterval(interval);
          setPolling(false);
          setPaymentRecord(payment);
          setStep("confirm");
          qc.invalidateQueries({ queryKey: ["/api/candidates"] });
        }
      } catch (_) {}
      if (attempts >= 12) { clearInterval(interval); setPolling(false); }
    }, 5000);
  }

  function updateVote(candidateId: string, delta: number) {
    setSelections(prev => {
      const next = Math.max(0, (prev[candidateId] || 0) + delta);
      if (next === 0) { const { [candidateId]: _, ...rest } = prev; return rest; }
      return { ...prev, [candidateId]: next };
    });
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast({ title: "Name required", variant: "destructive" });
    if (!phone.trim()) return toast({ title: "Phone required", variant: "destructive" });
    registerMutation.mutate();
  }

  function handleSubmitVotes() {
    if (totalVotes === 0) return toast({ title: "No votes selected", description: "Add votes to at least one candidate.", variant: "destructive" });
    submitVotesMutation.mutate();
  }

  function resetApp() {
    setStep("register"); setFullName(""); setPhone(""); setVoterId(null);
    setSelections({}); setSession(null); setPaymentRecord(null); setPolling(false);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Crown className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold gold-shimmer leading-tight">NUSA Awards</h1>
              <p className="text-xs text-muted-foreground">Community Choice Voting</p>
            </div>
          </div>
          <Link href="/results">
            <Button variant="outline" size="sm" data-testid="link-results" className="border-primary/30 text-primary">
              <BarChart3 className="w-4 h-4 mr-1" />
              Live Results
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* REGISTER */}
        {step === "register" && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 border border-primary/20 mb-5 shadow-lg">
                <Trophy className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-4xl font-bold gold-shimmer mb-3">NUSA Awards 2025</h2>
              <p className="text-muted-foreground leading-relaxed">
                Vote for outstanding individuals shaping our community.
                Each vote costs <span className="text-primary font-semibold">KSh 10</span>, paid via M-Pesa.
              </p>
            </div>

            <Card className="border-border gold-border-glow" data-testid="card-register">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <User className="w-5 h-5 text-primary" />
                  Voter Registration
                </CardTitle>
                <CardDescription>Enter your details to start voting</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
                    <Input
                      id="fullName"
                      data-testid="input-fullname"
                      placeholder="e.g. Jane Wanjiku"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="bg-muted border-border focus-visible:ring-primary"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-foreground">M-Pesa Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        data-testid="input-phone"
                        className="pl-9 bg-muted border-border focus-visible:ring-primary"
                        placeholder="0712 345 678"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Used for M-Pesa STK Push payment</p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground font-semibold"
                    disabled={registerMutation.isPending}
                    data-testid="button-register"
                  >
                    {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                    Start Voting
                  </Button>
                </form>
              </CardContent>
            </Card>

            {!isLoading && (
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Candidates", value: candidates.length },
                  { label: "Categories", value: categories.length },
                  { label: "Per Vote", value: "KSh 10" },
                ].map(stat => (
                  <Card key={stat.label} className="text-center py-4 border-border">
                    <p className="text-2xl font-bold text-primary">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VOTE */}
        {step === "vote" && (
          <div>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Cast Your Votes</h2>
                <p className="text-muted-foreground text-sm">
                  Voting as <span className="text-primary font-semibold">{fullName}</span> — KSh 10 per vote, unlimited
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={resetApp} className="border-border" data-testid="button-back">
                  Back
                </Button>
                <Button
                  onClick={handleSubmitVotes}
                  disabled={totalVotes === 0 || submitVotesMutation.isPending}
                  className="bg-primary text-primary-foreground font-semibold"
                  data-testid="button-submit-votes"
                >
                  {submitVotesMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Vote className="w-4 h-4 mr-2" />}
                  Pay KSh {totalAmount}
                </Button>
              </div>
            </div>

            {/* Vote summary bar */}
            {totalVotes > 0 && (
              <div className="mb-6 px-4 py-3 rounded-md bg-primary/10 border border-primary/25 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Vote className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground text-sm">
                    {totalVotes} vote{totalVotes > 1 ? "s" : ""} across {Object.keys(selections).length} candidate{Object.keys(selections).length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="font-bold text-primary text-lg">KSh {totalAmount}</div>
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-8">
                {categories.map(cat => {
                  const cfg = categoryConfig[cat] || categoryConfig["General"];
                  const CatIcon = cfg.icon;
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-4">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-semibold border ${cfg.color}`}>
                          <CatIcon className="w-3.5 h-3.5" />
                          {cat}
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {(grouped[cat] || []).map(candidate => {
                          const count = selections[candidate.id] || 0;
                          return (
                            <Card
                              key={candidate.id}
                              className={`border-border transition-all duration-200 ${count > 0 ? `ring-2 ${cfg.glow} gold-border-glow` : ""}`}
                              data-testid={`card-candidate-${candidate.id}`}
                            >
                              <CardContent className="pt-4 pb-4">
                                <div className="flex items-start gap-3 mb-4">
                                  <CandidateAvatar name={candidate.name} />
                                  <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-foreground leading-tight" data-testid={`text-candidate-name-${candidate.id}`}>
                                      {candidate.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                      {candidate.description}
                                    </p>
                                  </div>
                                </div>

                                <div className="mb-4">
                                  <div className="flex justify-between mb-1">
                                    <span className="text-xs text-muted-foreground">Live votes</span>
                                    <span className="text-xs font-semibold text-primary" data-testid={`text-vote-count-${candidate.id}`}>
                                      {candidate.total_votes.toLocaleString()}
                                    </span>
                                  </div>
                                  <Progress value={(candidate.total_votes / maxVotes) * 100} className="h-1.5" />
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => updateVote(candidate.id, -1)}
                                      disabled={count === 0}
                                      className="border-border"
                                      data-testid={`button-vote-minus-${candidate.id}`}
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </Button>
                                    <span className="w-8 text-center font-bold text-foreground" data-testid={`text-my-votes-${candidate.id}`}>
                                      {count}
                                    </span>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => updateVote(candidate.id, 1)}
                                      className="border-border"
                                      data-testid={`button-vote-plus-${candidate.id}`}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                  {count > 0 && (
                                    <Badge className="bg-primary/20 text-primary border-primary/30" data-testid={`badge-votes-cost-${candidate.id}`}>
                                      KSh {count * 10}
                                    </Badge>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalVotes > 0 && (
              <div className="mt-10 flex justify-center">
                <Button
                  size="lg"
                  onClick={handleSubmitVotes}
                  disabled={submitVotesMutation.isPending}
                  className="bg-primary text-primary-foreground font-bold px-8 shadow-lg"
                  data-testid="button-submit-votes-bottom"
                >
                  {submitVotesMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Vote className="w-5 h-5 mr-2" />}
                  Proceed to Pay — KSh {totalAmount}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* PAYMENT */}
        {step === "payment" && session && (
          <div className="max-w-md mx-auto">
            <Card className="border-border gold-border-glow" data-testid="card-payment">
              <CardHeader className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mx-auto mb-2">
                  <Phone className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-foreground">Complete Payment</CardTitle>
                <CardDescription>
                  {session.status === "stk_pushed"
                    ? "An M-Pesa prompt has been sent to your phone"
                    : session.message}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-md bg-muted/50 divide-y divide-border">
                  {[
                    { label: "Voter", value: fullName },
                    { label: "Phone", value: phone },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center px-4 py-3">
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span className="text-sm font-medium text-foreground">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-muted-foreground">Total Votes</span>
                    <span className="text-sm font-semibold text-foreground" data-testid="text-total-votes">
                      {session.total_votes} vote{session.total_votes > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm font-semibold text-foreground">Amount Due</span>
                    <span className="text-xl font-bold text-primary" data-testid="text-amount-due">KSh {session.amount}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Selections</p>
                  {Object.entries(selections).map(([cid, count]) => {
                    const cand = candidates.find(c => c.id === cid);
                    if (!cand) return null;
                    return (
                      <div key={cid} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{cand.name}</span>
                        <span className="text-muted-foreground">{count} × KSh 10 = <strong className="text-primary">KSh {count * 10}</strong></span>
                      </div>
                    );
                  })}
                </div>

                {session.status === "stk_pushed" && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-primary/10 border border-primary/20">
                    {polling ? <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" /> : <Clock className="w-5 h-5 text-primary flex-shrink-0" />}
                    <div>
                      <p className="text-sm font-medium text-primary">Awaiting payment</p>
                      <p className="text-xs text-muted-foreground">{polling ? "Checking status automatically..." : "Enter your M-Pesa PIN on your phone"}</p>
                    </div>
                  </div>
                )}
                {session.status === "credentials_missing" && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-primary/10 border border-primary/20">
                    <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-primary">M-Pesa not yet configured</p>
                      <p className="text-xs text-muted-foreground">Votes saved. Payment will activate once credentials are added.</p>
                    </div>
                  </div>
                )}
                {session.status === "stk_failed" && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                    <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-destructive">STK Push failed</p>
                      <p className="text-xs text-muted-foreground">{session.message}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {session.status === "stk_pushed" && (
                    <Button
                      onClick={() => verifyMutation.mutate(session.payment_id)}
                      disabled={verifyMutation.isPending}
                      className="w-full bg-primary text-primary-foreground"
                      data-testid="button-check-payment"
                    >
                      {verifyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      I've Paid — Verify Now
                    </Button>
                  )}
                  <Button variant="ghost" className="w-full text-muted-foreground" onClick={resetApp} data-testid="button-vote-again">
                    Start a new voting session
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CONFIRM */}
        {step === "confirm" && paymentRecord && (
          <div className="max-w-md mx-auto text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 border border-primary/20 mb-6 shadow-lg">
              <CheckCircle2 className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl font-bold gold-shimmer mb-2">Votes Confirmed!</h2>
            <p className="text-muted-foreground mb-6">
              Your {paymentRecord.total_votes} vote{paymentRecord.total_votes > 1 ? "s" : ""} have been counted.
              Thank you for participating in the NUSA Awards!
            </p>

            <Card className="mb-6 text-left border-border gold-border-glow">
              <CardContent className="pt-4">
                <div className="divide-y divide-border">
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-muted-foreground">Votes Cast</span>
                    <span className="font-semibold text-foreground" data-testid="text-confirmed-votes">{paymentRecord.total_votes}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="font-semibold text-primary">KSh {paymentRecord.amount}</span>
                  </div>
                  {paymentRecord.mpesa_receipt && (
                    <div className="flex justify-between py-2 text-sm">
                      <span className="text-muted-foreground">M-Pesa Receipt</span>
                      <span className="font-mono text-foreground" data-testid="text-receipt">{paymentRecord.mpesa_receipt}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={resetApp} className="bg-primary text-primary-foreground font-semibold" data-testid="button-vote-again-confirm">
                <Vote className="w-4 h-4 mr-2" />
                Vote Again
              </Button>
              <Link href="/results">
                <Button variant="outline" className="border-primary/30 text-primary" data-testid="link-see-results">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  See Live Results
                </Button>
              </Link>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-border mt-16 py-6 text-center text-sm text-muted-foreground">
        <p className="text-primary/60 font-medium">NUSA Awards 2025</p>
        <p className="mt-1 text-muted-foreground">Community Choice Voting Platform &mdash; KSh 10 per vote via M-Pesa</p>
      </footer>
    </div>
  );
}
