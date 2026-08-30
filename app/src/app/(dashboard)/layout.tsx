import Link from "next/link";
import { requireCurrentStaff } from "@/lib/auth";
import { schoolThemeStyle } from "@/lib/theme";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { staff, school } = await requireCurrentStaff();

  return (
    <div style={schoolThemeStyle(school)} className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            {school.brand_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.brand_logo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                {school.name.slice(0, 1)}
              </span>
            )}
            <span className="font-semibold">{school.name} Admissions</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="transition-color text-[var(--color-muted)] hover:text-[var(--color-ink)]">
              Pipeline
            </Link>
            {staff.role === "admin" && (
              <Link
                href="/settings/integrations"
                className="transition-color text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Integrations
              </Link>
            )}
            <span className="text-[var(--color-muted)]">{staff.full_name}</span>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
