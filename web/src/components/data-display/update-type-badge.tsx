import { Badge } from "@/components/ui/badge";

const UPDATE_TYPE_META: Record<string, { label: string; tone: "neutral" | "blue" | "green" | "amber" | "red" | "zinc" }> = {
  COMMENT: { label: "Comment", tone: "blue" },
  NOTE: { label: "Note", tone: "zinc" },
  STATUS_CHANGE: { label: "Status", tone: "amber" },
  IMPORT: { label: "Import", tone: "zinc" },
  PEER_REVIEW: { label: "Peer Review", tone: "green" },
};

export function UpdateTypeBadge({ updateType }: { updateType: string }) {
  const meta = UPDATE_TYPE_META[updateType] ?? {
    label: updateType.replaceAll("_", " "),
    tone: "neutral" as const,
  };

  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
