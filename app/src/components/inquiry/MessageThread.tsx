import type { Message } from "@/types/database";

export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">No messages yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`rounded-xl border p-3.5 text-sm ${
            message.direction === "inbound"
              ? "border-[var(--color-line)] bg-[var(--color-surface)]"
              : "border-brand-primary/20 bg-brand-primary/5"
          }`}
        >
          <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>
              {message.direction === "inbound" ? "From parent" : "Sent to parent"} · {message.from_address}
            </span>
            <time dateTime={message.created_at}>
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
                new Date(message.created_at),
              )}
            </time>
          </div>
          {message.subject && <p className="mb-1 font-medium">{message.subject}</p>}
          <p className="whitespace-pre-wrap text-[var(--color-ink)]">{message.body_text}</p>
        </div>
      ))}
    </div>
  );
}
