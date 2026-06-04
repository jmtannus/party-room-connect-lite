import { useCallback, useEffect, useState } from "react";
import { createRoom } from "./services/rooms";
import { createQuestion, getQuestions } from "./services/questions";
import { createAssignment, getAssignments } from "./services/assignments";
import { createResponse, getResponses } from "./services/responses";
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

type Response = {
  id: string;
  player_id: string;
  question_id: string;
  answer_text: string;
};

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [myQuestion, setMyQuestion] = useState<Question | null>(null);

  const [responses, setResponses] = useState<Response[]>([]);

  const [answerText, setAnswerText] = useState("");
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
      await loadMyQuestion();
    }

    setAssignments(roomAssignments || []);
    await loadResponses(room.id);
  }

  async function loadResponses(roomId: string) {
    const { data } = await getResponses(roomId);

    setResponses(data || []);
  }

  async function handleLeave() {
    if (!currentPlayer) return;

    try {
      await supabase.from("players").delete().eq("id", currentPlayer.id);
    } catch (err) {
      console.error(err);
    }

    setCurrentPlayer(null);
    setIsCreator(false);
    setAssignments([]);
    setMyQuestion(null);
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
          if (currentRoom) await loadResponses(currentRoom.id);
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
    await loadResponses(currentRoom.id);
    alert("Perguntas distribuídas!");
  }

  async function handleSendAnswer() {
    if (!currentRoom || !currentPlayer || !myQuestion) return;

    const already = responses.find(
      (r) => r.player_id === currentPlayer.id && r.question_id === myQuestion.id,
    );

    if (already) {
      alert("Você já respondeu essa pergunta.");
      return;
    }

    const { error } = await createResponse(
      currentRoom.id,
      currentPlayer.id,
      myQuestion.id,
      answerText,
    );

    if (error) {
      console.error(error);
      return;
    }

    setAnswerText("");
    await loadResponses(currentRoom.id);
    alert("Resposta enviada!");
  }

  const hasAnswered =
    currentPlayer && myQuestion
      ? responses.some(
          (r) => r.player_id === currentPlayer.id && r.question_id === myQuestion.id,
        )
      : false;

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
        disabled={!!currentPlayer}
      />

      <br />
      <br />

      <input
        placeholder="Seu nome"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        disabled={!!currentPlayer}
      />

      <br />
      <br />

      <button onClick={handleJoinRoom} disabled={!!currentPlayer}>
        Entrar
      </button>

      {currentPlayer && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee" }}>
          <strong>Você entrou como: {currentPlayer.name}</strong>
          <div>
            Papel: {isCreator ? "Criador da sala" : "Jogador"}
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={handleLeave}>Sair</button>
          </div>
        </div>
      )}

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

          {assignments.length === players.length && (
            <div style={{ marginTop: 12 }}>
              <p>Responda:</p>
              <input
                style={{ width: "400px" }}
                placeholder="Escreva sua resposta..."
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                disabled={hasAnswered}
              />
              <br />
              <br />
              <button onClick={handleSendAnswer} disabled={hasAnswered || !answerText.trim()}>
                Enviar Resposta
              </button>
              {hasAnswered && <p>Você já respondeu essa pergunta.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
