import { useState } from "react";
import { createRoom } from "./services/rooms";

export default function App() {
  const [roomCode, setRoomCode] = useState("");

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
  }

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
    </div>
  );
}