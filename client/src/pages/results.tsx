import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Trophy, Vote, Star, Zap, Award, ArrowLeft, Medal } from "lucide-react";
import type { CandidateWithVotes } from "@shared/schema";

const categoryColors: Record<string, string> = {
  "Best Leader": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  "Innovation Award": "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  "Entrepreneur of the Year": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  "General": "bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
};

const categoryIcons: Record<string, typeof Award> = {
  "Best Leader": Star,
  "Innovation Award": Zap,
  "Entrepreneur of the Year": Trophy,
  "General": Award,
};

function AvatarPlaceholder({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const colors = [
    "from-blue-500 to-blue-700",
    "from-purple-500 to-purple-700",
    "from-amber-500 to-amber-700",
    "from-green-500 to-green-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;
  const sizeClass = size === "lg" ? "w-16 h-16 text-xl" : size === "md" ? "w-12 h-12 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br ${colors[colorIndex]} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="w-5 h-5 text-amber-500" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
  return <span className="w-5 h-5 text-center text-sm font-bold text-muted-foreground">{rank}</span>;
}

export default function Results() {
  const { data: candidates = [], isLoading, refetch } = useQuery<CandidateWithVotes[]>({
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">NUSA Awards</h1>
              <p className="text-xs text-muted-foreground">Live Results</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="link-vote">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Vote Now
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-1">Live Voting Results</h2>
          <p className="text-muted-foreground">
            Results update automatically every 10 seconds. Total votes cast:{" "}
            <strong className="text-foreground" data-testid="text-total-votes-results">{totalVotes.toLocaleString()}</strong>
          </p>
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total Votes", value: totalVotes.toLocaleString(), icon: Vote },
            { label: "Candidates", value: candidates.length, icon: Award },
            { label: "Categories", value: categories.length, icon: Star },
            { label: "Amount Raised", value: `KSh ${(totalVotes * 10).toLocaleString()}`, icon: Trophy },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-primary" />
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
              const catCandidates = grouped[cat] || [];
              const CatIcon = categoryIcons[cat] || Award;
              const colorClass = categoryColors[cat] || categoryColors["General"];
              const catTotal = catCandidates.reduce((s, c) => s + c.total_votes, 0);
              const leader = catCandidates[0];

              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-semibold border ${colorClass}`}>
                      <CatIcon className="w-3.5 h-3.5" />
                      {cat}
                    </div>
                    {leader && leader.total_votes > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        <span>Leading: <strong className="text-foreground">{leader.name}</strong></span>
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
                          className={isLeader ? "ring-2 ring-amber-400/50" : ""}
                          data-testid={`card-result-${candidate.id}`}
                        >
                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-6 flex-shrink-0">
                                <RankMedal rank={idx + 1} />
                              </div>
                              <AvatarPlaceholder name={candidate.name} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground text-sm" data-testid={`text-result-name-${candidate.id}`}>
                                      {candidate.name}
                                    </span>
                                    {isLeader && (
                                      <Badge className="text-xs py-0" data-testid={`badge-leader-${candidate.id}`}>
                                        Leading
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-foreground" data-testid={`text-result-votes-${candidate.id}`}>
                                      {candidate.total_votes.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {pct}%
                                    </span>
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
          <div className="text-center py-16">
            <Vote className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No votes yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Be the first to vote!</p>
            <Link href="/">
              <Button data-testid="button-go-vote">Go Vote Now</Button>
            </Link>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-16 py-6 text-center text-sm text-muted-foreground">
        <p>NUSA Awards 2025 &mdash; Results refresh every 10 seconds</p>
      </footer>
    </div>
  );
}
