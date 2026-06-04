import { supabase } from "../lib/supabase";

export async function createCardAssignment(
  roomId: string,
  playerId: string,
  assignmentId: string,
) {
  return supabase.from("card_assignments").insert({
    room_id: roomId,
    player_id: playerId,
    assignment_id: assignmentId,
  }).select().single();
}

export async function getCardAssignments(roomId: string) {
  return supabase
    .from("card_assignments")
    .select("*")
    .eq("room_id", roomId);
}

export async function deleteCardAssignments(roomId: string) {
  return supabase
    .from("card_assignments")
    .delete()
    .eq("room_id", roomId);
}
