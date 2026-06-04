import { supabase } from "../lib/supabase";

export async function createAssignment(
  roomId: string,
  playerId: string,
  questionId: string
) {
  return supabase
    .from("assignments")
    .insert({
      room_id: roomId,
      player_id: playerId,
      question_id: questionId,
    })
    .select()
    .single();
}

export async function getAssignments(roomId: string) {
  return supabase
    .from("assignments")
    .select("*")
    .eq("room_id", roomId);
}