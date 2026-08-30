import type { InquiryStatus } from "@/types/database";

export const KANBAN_COLUMNS: { status: InquiryStatus; title: string }[] = [
  { status: "new", title: "New" },
  { status: "contacted", title: "Contacted" },
  { status: "tour_scheduled", title: "Tour scheduled" },
  { status: "tour_completed", title: "Tour completed" },
  { status: "enrolled", title: "Enrolled" },
  { status: "closed_lost", title: "Closed – lost" },
];
