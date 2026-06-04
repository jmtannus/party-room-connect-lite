import { useEffect, useState } from "react";
import { createRoom } from "./services/rooms";
import { supabase } from "./lib/supabase";

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState<any[]>([]);

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

    const { error } = await supabase
      .from("players")
      .insert({
        room_id: room.id,
        name: playerName,
      });

    if (error) {
      console.error(error);
      return;
    }

    loadPlayers(room.id);
  }

  async function loadPlayers(roomId: string) {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at");

    setPlayers(data || []);
  }

  useEffect(() => {
    if (!joinCode) return;

    const channel = supabase
      .channel("players")
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joinCode]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Party Room Connect Lite</h1>

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
        onChange={(e) => setJoinCode(e.target.value)}
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
    </div>
  );
}