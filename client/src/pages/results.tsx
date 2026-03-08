import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Trophy, Vote, Star, Zap, Award, ArrowLeft, Medal, Crown, RefreshCw } from "lucide-react";
import type { CandidateWithVotes } from "@shared/schema";

const categoryConfig: Record<string, { color: string; icon: typeof Award }> = {
  "Best Leader": { color: "text-amber-400 border-amber-500/30 bg-amber-500/10", icon: Star },
  "Innovation Award": { color: "text-yellow-300 border-yellow-500/30 bg-yellow-500/10", icon: Zap },
  "Entrepreneur of the Year": { color: "text-orange-400 border-orange-500/30 bg-orange-500/10", icon: Trophy },
  "General": { color: "text-primary border-primary/30 bg-primary/10", icon: Award },
};

function CandidateAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
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
  const sz = size === "md" ? "w-11 h-11 text-sm" : "w-8 h-8 text-xs";
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br ${gradients[gi]} flex items-center justify-center font-bold text-black flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
      <Crown className="w-3.5 h-3.5 text-primary" />
    </div>
  );
  if (rank === 2) return (
    <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
      <Medal className="w-3.5 h-3.5 text-muted-foreground" />
    </div>
  );
  if (rank === 3) return (
    <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
      <Medal className="w-3.5 h-3.5 text-muted-foreground/60" />
    </div>
  );
  return (
    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-muted-foreground">{rank}</span>
    </div>
  );
}

export default function Results() {
  const { data: candidates = [], isLoading, refetch, isFetching } = useQuery<CandidateWithVotes[]>({
    queryKey: ["/api/candidates"],
    refetchInterval: 10000,
  });

  const totalVotes = candidates.reduce((sum, c) => sum + c.total_votes, 0);
  const categories = [...new Set(candidates.map(c => c.category))];

  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = [...candidates.filter(c => c.category === cat)].sort((a, b) => b.total_votes - a.total_votes);
    return acc;
  }, {} as Record<string, CandidateWithVotes[]>);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Crown className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold gold-shimmer leading-tight">NUSA Awards</h1>
              <p className="text-xs text-muted-foreground">Live Results</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-primary"
              data-testid="button-refresh"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {!isFetching && "Refresh"}
            </Button>
            <Link href="/">
              <Button variant="outline" size="sm" className="border-primary/30 text-primary" data-testid="link-vote">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Vote Now
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold gold-shimmer mb-1">Live Voting Results</h2>
          <p className="text-muted-foreground text-sm">
            Auto-refreshes every 10 seconds &mdash; Total votes counted:{" "}
            <strong className="text-primary" data-testid="text-total-votes-results">{totalVotes.toLocaleString()}</strong>
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { label: "Total Votes", value: totalVotes.toLocaleString(), icon: Vote },
            { label: "Candidates", value: candidates.length, icon: Award },
            { label: "Categories", value: categories.length, icon: Star },
            { label: "Amount Raised", value: `KSh ${(totalVotes * 10).toLocaleString()}`, icon: Trophy },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-border">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-10">
            {categories.map(cat => {
              const cfg = categoryConfig[cat] || categoryConfig["General"];
              const CatIcon = cfg.icon;
              const catCandidates = grouped[cat] || [];
              const catTotal = catCandidates.reduce((s, c) => s + c.total_votes, 0);
              const leader = catCandidates[0];

              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-semibold border ${cfg.color}`}>
                      <CatIcon className="w-3.5 h-3.5" />
                      {cat}
                    </div>
                    {leader && leader.total_votes > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Trophy className="w-3.5 h-3.5 text-primary" />
                        <span>Leading: <strong className="text-primary">{leader.name}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {catCandidates.map((candidate, idx) => {
                      const pct = catTotal > 0 ? Math.round((candidate.total_votes / catTotal) * 100) : 0;
                      const isLeader = idx === 0 && candidate.total_votes > 0;

                      return (
                        <Card
                          key={candidate.id}
                          className={`border-border transition-all duration-300 ${isLeader ? "gold-border-glow ring-1 ring-primary/30" : ""}`}
                          data-testid={`card-result-${candidate.id}`}
                        >
                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-center gap-3">
                              <RankBadge rank={idx + 1} />
                              <CandidateAvatar name={candidate.name} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground text-sm" data-testid={`text-result-name-${candidate.id}`}>
                                      {candidate.name}
                                    </span>
                                    {isLeader && (
                                      <Badge className="text-xs py-0 bg-primary/20 text-primary border-primary/30" data-testid={`badge-leader-${candidate.id}`}>
                                        Leading
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-primary" data-testid={`text-result-votes-${candidate.id}`}>
                                      {candidate.total_votes.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{pct}%</span>
                                  </div>
                                </div>
                                <Progress value={pct} className="h-2" />
                              </div>
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

        {!isLoading && totalVotes === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Vote className="w-10 h-10 text-primary" />
            </div>
            <h3 className="font-bold text-foreground text-lg mb-1">No votes yet</h3>
            <p className="text-muted-foreground text-sm mb-6">Be the first to vote in the NUSA Awards!</p>
            <Link href="/">
              <Button className="bg-primary text-primary-foreground" data-testid="button-go-vote">
                Go Vote Now
              </Button>
            </Link>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-16 py-6 text-center text-sm text-muted-foreground">
        <p className="text-primary/60 font-medium">NUSA Awards 2025</p>
        <p className="mt-1">Results refresh every 10 seconds &mdash; Only paid votes are counted</p>
      </footer>
    </div>
  );
}
