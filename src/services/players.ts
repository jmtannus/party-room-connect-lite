import { supabase } from "../lib/supabase";

export async function joinRoom(
  roomId: string,
  name: string
) {
  return supabase
    .from("players")
    .insert({
      room_id: roomId,
      name,
    })
    .select()
    .single();
}
export async function getPlayers(roomId: string) {
  return supabase
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at");
}