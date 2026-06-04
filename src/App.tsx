import { useCallback, useEffect, useState } from "react";
import { createRoom } from "./services/rooms";
import { createQuestion, getQuestions } from "./services/questions";
import { createAssignment, getAssignments } from "./services/assignments";
import { supabase } from "./lib/supabase";

type Player = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  code: string;
};

type Question = {
  id: string;
  player_id: string;
  question_text: string;
};

type Assignment = {
  id: string;
  player_id: string;
  question_id: string;
  room_id: string;
};

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [myQuestion, setMyQuestion] = useState<Question | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  const [questionText, setQuestionText] = useState("");
  const [isCreator, setIsCreator] = useState(false);

  const loadMyQuestion = useCallback(async () => {
    if (!currentPlayer || !currentRoom) return;

    const { data: roomAssignments } = await getAssignments(currentRoom.id);

    const myAssignment = roomAssignments?.find(
      (a) => a.player_id === currentPlayer.id,
    );

    if (!myAssignment) return;

    const { data: question } = await supabase
      .from("questions")
      .select("*")
      .eq("id", myAssignment.question_id)
      .single();

    setMyQuestion(question);
  }, [currentPlayer, currentRoom]);

  async function handleCreateRoom() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await createRoom(code);

    if (error) {
      console.error(error);
      return;
    }

    setRoomCode(data.code);
    setJoinCode(data.code);
    setIsCreator(true);
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
    // If the current client created the room earlier in this session,
    // keep the isCreator flag. Otherwise ensure it's false.
    if (joinCode !== room.code) setIsCreator(false);

    loadPlayers(room.id);
    loadQuestions(room.id);
    const { data: roomAssignments } = await getAssignments(room.id);

    if (roomAssignments?.length) {
      setAssignments(roomAssignments);
      loadMyQuestion();
    }

    setAssignments(roomAssignments || []);
    await loadMyQuestion();
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
      questionText,
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
        },
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
        },
      ) 
      
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
        },
        async () => {
          if (!currentRoom) return;

          const { data } =
            await getAssignments(currentRoom.id);

          setAssignments(data || []);

          loadMyQuestion();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joinCode, currentRoom, loadMyQuestion]);
  async function handleDistributeQuestions() {
    if (!currentRoom) return;

    if (!isCreator || !currentPlayer) {
      alert("Apenas o criador da sala pode distribuir as perguntas.");
      return;
    }

    const { data: existingAssignments } = await getAssignments(currentRoom.id);

    if (existingAssignments?.length) {
      alert("Perguntas já distribuídas.");
      return;
    }

    if (players.length !== questions.length) {
      alert("Ainda faltam perguntas.");
      return;
    }

    const shuffledQuestions = [...questions];

    let valid = false;

    while (!valid) {
      shuffledQuestions.sort(() => Math.random() - 0.5);

      valid = players.every(
        (player, index) => shuffledQuestions[index].player_id !== player.id,
      );
    }

    for (let i = 0; i < players.length; i++) {
      await createAssignment(
        currentRoom.id,
        players[i].id,
        shuffledQuestions[i].id,
      );
    }

    const { data } = await getAssignments(currentRoom.id);

    setAssignments(data || []);
    await loadMyQuestion();
    alert("Perguntas distribuídas!");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>🎲 Party Room Connect Lite</h1>

      <button onClick={handleCreateRoom}>Criar Sala</button>

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
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
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

      <button onClick={handleJoinRoom}>Entrar</button>

      <hr />

      <h2>Participantes</h2>

      <ul>
        {players.map((player) => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>

      <p>
        Perguntas enviadas: {questions.length} de {players.length}
      </p>

      {players.length > 0 &&
        questions.length === players.length &&
        assignments.length === 0 && (
          <>
                    <p>✅ Todos os participantes enviaram suas perguntas!</p>

                    {isCreator ? (
                      <button onClick={handleDistributeQuestions}>
                        🎲 Distribuir Perguntas
                      </button>
                    ) : (
                      <p>Esperando o criador distribuir as perguntas...</p>
                    )}
          </>
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

      <button onClick={handleSendQuestion}>Enviar Pergunta</button>

      {myQuestion && (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid #ddd" }}>
          <h2>Pergunta Recebida</h2>
          <p>O que você faria se...</p>
          <strong>{myQuestion.question_text}</strong>
        </div>
      )}
    </div>
  );
}
