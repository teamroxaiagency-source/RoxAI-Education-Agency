"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function BillingActions({ hasSubscription }: { hasSubscription: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Something went wrong");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={pending} onClick={() => go(hasSubscription ? "/api/billing/portal" : "/api/billing/checkout")}>
        {pending ? "Redirecting…" : hasSubscription ? "Manage billing" : "Subscribe"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
