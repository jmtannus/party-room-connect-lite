import { useEffect, useState } from "react";
import { createRoom } from "./services/rooms";
import {
  createQuestion,
  getQuestions,
} from "./services/questions";
import { supabase } from "./lib/supabase";

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  const [players, setPlayers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);

  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [currentPlayer, setCurrentPlayer] = useState<any>(null);

  const [questionText, setQuestionText] = useState("");

  async function handleCreateRoom() {
    const code = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    const { data, error } = await createRoom(code);

    if (error) {
      console.error(error);
      return;
    }

    setRoomCode(data.code);
    setJoinCode(data.code);
  }

  async function handleJoinRoom() {
    const { data: room } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", joinCode)
      .single();

    if (!room) {
      alert("Sala não encontrada");
      return;
    }

    const { data: player, error } = await supabase
      .from("players")
      .insert({
        room_id: room.id,
        name: playerName,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setCurrentRoom(room);
    setCurrentPlayer(player);

    loadPlayers(room.id);
    loadQuestions(room.id);
  }

  async function loadPlayers(roomId: string) {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at");

    setPlayers(data || []);
  }

  async function loadQuestions(roomId: string) {
    const { data } = await getQuestions(roomId);

    setQuestions(data || []);
  }

  async function handleSendQuestion() {
    if (!currentRoom || !currentPlayer) {
      alert("Entre na sala primeiro");
      return;
    }

    const { error } = await createQuestion(
      currentRoom.id,
      currentPlayer.id,
      questionText
    );

    if (error) {
      console.error(error);
      return;
    }

    alert("Pergunta enviada!");

    setQuestionText("");

    loadQuestions(currentRoom.id);
  }

  useEffect(() => {
    if (!joinCode) return;

    const channel = supabase
      .channel("room-updates")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
        },
        async () => {
          const { data: room } = await supabase
            .from("rooms")
            .select("*")
            .eq("code", joinCode)
            .single();

          if (room) {
            loadPlayers(room.id);
          }
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
        },
        async () => {
          const { data: room } = await supabase
            .from("rooms")
            .select("*")
            .eq("code", joinCode)
            .single();

          if (room) {
            loadQuestions(room.id);
          }
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joinCode]);

  return (
    <div style={{ padding: 24 }}>
      <h1>🎲 Party Room Connect Lite</h1>

      <button onClick={handleCreateRoom}>
        Criar Sala
      </button>

      {roomCode && (
        <p>
          Código da sala: <strong>{roomCode}</strong>
        </p>
      )}

      <hr />

      <h2>Entrar na Sala</h2>

      <input
        placeholder="Código da sala"
        value={joinCode}
        onChange={(e) =>
          setJoinCode(e.target.value.toUpperCase())
        }
      />

      <br />
      <br />

      <input
        placeholder="Seu nome"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />

      <br />
      <br />

      <button onClick={handleJoinRoom}>
        Entrar
      </button>

      <hr />

      <h2>Participantes</h2>

      <ul>
        {players.map((player) => (
          <li key={player.id}>
            {player.name}
          </li>
        ))}
      </ul>

      <p>
        Perguntas enviadas: {questions.length} de {players.length}
      </p>

      {players.length > 0 &&
        questions.length === players.length && (
          <p>
            ✅ Todos os participantes enviaram suas perguntas!
          </p>
        )}

      <hr />

      <h2>Sua Pergunta</h2>

      <p>Complete a frase:</p>

      <strong>O que você faria se...</strong>

      <br />
      <br />

      <input
        style={{ width: "400px" }}
        placeholder="ganhasse na loteria?"
        value={questionText}
        onChange={(e) => setQuestionText(e.target.value)}
      />

      <br />
      <br />

      <button onClick={handleSendQuestion}>
        Enviar Pergunta
      </button>
    </div>
  );
}