import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { School, StaffUser } from "@/types/database";

export interface CurrentStaff {
  staff: StaffUser;
  school: School;
}

/**
 * Resolves the signed-in staff member and their school for use in Server
 * Components and route handlers. Redirects to /login when unauthenticated
 * — middleware already does this for full pages, but route handlers and
 * Server Actions need their own guard since middleware only redirects
 * top-level navigations.
 */
export async function requireCurrentStaff(): Promise<CurrentStaff> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    redirect("/login");
  }

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("*")
    .eq("id", staff.school_id)
    .single();

  if (schoolError || !school) {
    redirect("/login");
  }

  return { staff, school };
}
