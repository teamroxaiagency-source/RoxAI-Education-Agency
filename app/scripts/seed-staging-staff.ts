/**
 * Creates (or updates) one admin staff account for a school, using the
 * service-role key. Run this after applying migrations + supabase/seed.sql
 * so the school row already exists.
 *
 * Usage:
 *   STAFF_EMAIL=admin@meridianprep.example.org \
 *   STAFF_PASSWORD='choose-a-real-password' \
 *   STAFF_NAME='Jordan Ellis' \
 *   SCHOOL_SLUG=meridian-prep \
 *   npm run seed:staff
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = requireEnv("STAFF_EMAIL");
  const password = requireEnv("STAFF_PASSWORD");
  const fullName = requireEnv("STAFF_NAME");
  const schoolSlug = process.env.SCHOOL_SLUG ?? "meridian-prep";
  const role = process.env.STAFF_ROLE === "admissions_staff" ? "admissions_staff" : "admin";

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: school, error: schoolError } = await supabase.from("schools").select("id, name").eq("slug", schoolSlug).single();
  if (schoolError || !school) {
    throw new Error(`No school with slug "${schoolSlug}" — run supabase/seed.sql first, or pass an existing SCHOOL_SLUG.`);
  }

  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  let userId = existingUsers.users.find((u) => u.email === email)?.id;

  if (!userId) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError ?? new Error("Failed to create auth user");
    userId = created.user.id;
    console.log(`Created auth user ${email} (${userId})`);
  } else {
    console.log(`Auth user ${email} already exists (${userId}) — updating staff_users row only.`);
  }

  const { error: upsertError } = await supabase.from("staff_users").upsert({
    id: userId,
    school_id: school.id,
    email,
    full_name: fullName,
    role,
  });
  if (upsertError) throw upsertError;

  console.log(`✔ ${fullName} <${email}> is now a ${role} at ${school.name}.`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
