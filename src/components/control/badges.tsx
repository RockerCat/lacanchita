import Badge from "@/components/ui/Badge";
import { EVENT_STATUS_LABELS_CONTROL, MATCH_STATUS_LABELS, RESULT_STATE_LABELS, type ResultState } from "@/lib/control/results";

const EVENT_VARIANT: Record<string, "green" | "blue" | "gold" | "red" | "gray"> = {
  draft: "gold",
  scheduled: "blue",
  in_progress: "green",
  finished: "gray",
  closed: "gray",
  cancelled: "red",
};

export function EventStatusBadge({ status }: { status: string }) {
  return <Badge variant={EVENT_VARIANT[status] ?? "gray"}>{EVENT_STATUS_LABELS_CONTROL[status] ?? status}</Badge>;
}

export function MatchStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "live" ? "green" : status === "cancelled" ? "red" : "gray"}>{MATCH_STATUS_LABELS[status] ?? status}</Badge>;
}

export function ResultBadge({ state }: { state: ResultState }) {
  const variant = state === "official" ? "green" : state === "live" ? "red" : state === "pending" ? "gold" : "gray";
  return <Badge variant={variant}>{RESULT_STATE_LABELS[state]}</Badge>;
}
