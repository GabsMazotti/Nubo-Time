import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Cliente admin (service_role) — ignora RLS. Use só dentro das Edge Functions. */
export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Registra um evento no histórico do lead. */
export async function addHistory(
  db: SupabaseClient,
  leadId: string,
  type: string,
  message?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("aa_lead_history").insert({
    lead_id: leadId,
    type,
    message: message ?? null,
    meta: meta ?? null,
  });
  if (error) console.error("addHistory error:", error.message);
}
