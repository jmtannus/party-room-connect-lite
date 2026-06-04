import { supabase } from "../lib/supabase";

export async function createQuestion(
  roomId: string,
  playerId: string,
  questionText: string
) {
  return supabase
    .from("questions")
    .insert({
      room_id: roomId,
      player_id: playerId,
      question_text: questionText,
    })
    .select()
    .single();
}

export async function getQuestions(roomId: string) {
  return supabase
    .from("questions")
    .select("*")
    .eq("room_id", roomId);
}