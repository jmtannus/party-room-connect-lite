import { supabase } from "../lib/supabase";

export async function createResponse(
  roomId: string,
  playerId: string,
  questionId: string,
  answerText: string,
  isAnonymous: boolean = false
) {
  return supabase
    .from("responses")
    .insert({
      room_id: roomId,
      player_id: playerId,
      question_id: questionId,
      answer_text: answerText,
      is_anonymous: isAnonymous,
    })
    .select()
    .single();
}

export async function getResponses(roomId: string) {
  return supabase
    .from("responses")
    .select("*")
    .eq("room_id", roomId);
}