import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string | null }) {
  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-2">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="pt-0 text-sm text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

