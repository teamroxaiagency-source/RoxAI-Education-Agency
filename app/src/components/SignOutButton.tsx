"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await createBrowserSupabaseClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="transition-color text-[var(--color-muted)] hover:text-[var(--color-ink)]"
    >
      Sign out
    </button>
  );
}
