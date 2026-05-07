import { supabase } from "@/integrations/supabase/client";

type Level = "info" | "warn" | "error";

export async function logEvent(
  level: Level,
  source: string,
  message: string,
  context?: unknown
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("logs").insert({
      user_id: user?.id ?? null,
      level,
      source,
      message: message.slice(0, 2000),
      context: context ? (JSON.parse(JSON.stringify(context)) as any) : null,
    });
  } catch {
    // swallow — never surface logger errors
  }
}

export const logError = (source: string, message: string, context?: unknown) =>
  logEvent("error", source, message, context);
