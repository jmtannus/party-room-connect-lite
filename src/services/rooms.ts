import { supabase } from "../lib/supabase";

export async function createRoom(code: string) {
  return supabase
    .from("rooms")
    .insert({
      code,
      status: "waiting",
    })
    .select()
    .single();
}
export async function getRoomByCode(
  code: string
) {
  return supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .single();
}