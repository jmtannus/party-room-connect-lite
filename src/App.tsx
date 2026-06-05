import { useCallback, useEffect, useState } from "react";
import { createRoom } from "./services/rooms";
import { createQuestion, getQuestions } from "./services/questions";
import { createAssignment, getAssignments } from "./services/assignments";
import { createResponse, getResponses } from "./services/responses";
import { createCardAssignment, getCardAssignments } from "./services/card_assignments";
import { joinRoom, getPlayers as svcGetPlayers } from "./services/players";
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

type CardAssignment = {
  id: string;
  player_id: string;
  assignment_id: string;
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

  const [responses, setResponses] = useState<Response[]>([]);
  const [cardAssignments, setCardAssignments] = useState<CardAssignment[]>([]);

  const [myCard, setMyCard] = useState<{ assignment: Assignment; response: Response } | null>(null);

  const [answerText, setAnswerText] = useState("");
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  const [questionText, setQuestionText] = useState("");
  const [hideResponderName, setHideResponderName] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);

  const loadMyQuestion = useCallback(async () => {
    if (!currentPlayer || !currentRoom) return;

    const { data: myAssignment, error: asgError } = await supabase
      .from("assignments")
      .select("*")
      .eq("room_id", currentRoom.id)
      .eq("player_id", currentPlayer.id)
      .single();

    if (asgError || !myAssignment) {
      setMyQuestion(null);
      return;
    }

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

    // If the creator provided a name before creating the room, create the player record
    if (playerName && playerName.trim()) {
      try {
        const { data: player, error: pErr } = await joinRoom(data.id, playerName.trim());
        if (!pErr && player) {
          setCurrentRoom(data);
          setCurrentPlayer(player);
          await reloadRoomState(data.id);
        }
      } catch (e) {
        console.error(e);
      }
    }
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

    const { data: player, error } = await joinRoom(room.id, playerName);

    if (error) {
      console.error(error);
      return;
    }

    setCurrentRoom(room);
    setCurrentPlayer(player);
    // Se a sala recebida for a mesma sala criada nesta sessão, preserve o criador
    if (room.code === roomCode) {
      setIsCreator(true);
    } else {
      setIsCreator(false);
    }

    await reloadRoomState(room.id);
  }

  const loadResponses = useCallback(async (roomId: string) => {
    const { data } = await getResponses(roomId);

    setResponses(data || []);
  }, []);

  const loadCardAssignments = useCallback(async (roomId: string) => {
    const { data } = await getCardAssignments(roomId);

    setCardAssignments(data || []);
  }, []);

  const loadMyCard = useCallback(async () => {
    if (!currentPlayer || !currentRoom) return;

    const { data: cardAsg } = await supabase
      .from("card_assignments")
      .select("*")
      .eq("room_id", currentRoom.id)
      .eq("player_id", currentPlayer.id)
      .single();

    if (!cardAsg) {
      setMyCard(null);
      return;
    }

    const { data: assignment } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", cardAsg.assignment_id)
      .single();

    if (!assignment) {
      setMyCard(null);
      return;
    }

    const { data: response } = await supabase
      .from("responses")
      .select("*")
      .eq("question_id", assignment.question_id)
      .single();

    if (assignment && response) {
      setMyCard({ assignment, response });
    } else {
      setMyCard(null);
    }
  }, [currentPlayer, currentRoom]);

  const loadAssignments = useCallback(async (roomId: string) => {
    const { data } = await getAssignments(roomId);

    setAssignments(data || []);
  }, []);

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data } = await svcGetPlayers(roomId);

    setPlayers(data || []);
  }, []);

  const loadQuestions = useCallback(async (roomId: string) => {
    const { data } = await getQuestions(roomId);

    setQuestions(data || []);
  }, []);

  const reloadRoomState = useCallback(
    async (roomId: string) => {
      await Promise.all([
        loadPlayers(roomId),
        loadQuestions(roomId),
        loadAssignments(roomId),
        loadResponses(roomId),
        loadCardAssignments(roomId),
      ]);

      await loadMyQuestion();
      await loadMyCard();
    },
    [loadPlayers, loadQuestions, loadAssignments, loadResponses, loadCardAssignments, loadMyQuestion, loadMyCard],
  );

  async function runValidation() {
    if (!currentRoom) {
      setValidationMessages(["Nenhuma sala selecionada."]);
      return;
    }

    const msgs: string[] = [];

    const { data: playersData } = await svcGetPlayers(currentRoom.id);
    const { data: questionsData } = await getQuestions(currentRoom.id);
    const { data: assignmentsData } = await getAssignments(currentRoom.id);
    const { data: responsesData } = await getResponses(currentRoom.id);

    const p: Player[] = playersData || [];
    const q: Question[] = questionsData || [];
    const a: Assignment[] = assignmentsData || [];
    const r: Response[] = responsesData || [];

    msgs.push(`Players: ${p.length}`);
    msgs.push(`Questions: ${q.length}`);
    msgs.push(`Assignments: ${a.length}`);
    msgs.push(`Responses: ${r.length}`);

    if (p.length === 0) msgs.push("Ainda não há jogadores na sala.");
    if (q.length < p.length) msgs.push(`Faltam ${p.length - q.length} pergunta(s).`);
    if (q.length > p.length) msgs.push("Há mais perguntas do que jogadores.");
    if (a.length === 0) msgs.push("As perguntas ainda não foram distribuídas.");
    if (a.length > 0 && a.length !== p.length) msgs.push("Distribuição incompleta (assignments !== players).");

    // check each player's assignment
    for (const player of p) {
      const asg = a.find((x: Assignment) => x.player_id === player.id);
      if (!asg) {
        msgs.push(`Jogador ${player.name} (id=${player.id}) não recebeu atribuição.`);
        continue;
      }
      const qItem = q.find((x: Question) => x.id === asg.question_id);
      if (!qItem) {
        msgs.push(`Atribuição de ${player.name} aponta para pergunta ausente (id=${asg.question_id}).`);
        continue;
      }
      if (qItem.player_id === player.id) msgs.push(`Atenção: ${player.name} recebeu a própria pergunta.`);
    }

    // verify current player has a question if assignments present
    if (currentPlayer) {
      const myAsg = a.find((x: Assignment) => x.player_id === currentPlayer.id);
      if (!myAsg) msgs.push("Você ainda não recebeu uma pergunta.");
      else {
        const qItem = q.find((x: Question) => x.id === myAsg.question_id);
        if (!qItem) msgs.push("Sua pergunta atribuída não foi encontrada.");
        else msgs.push(`Sua pergunta: ${qItem.question_text}`);
      }
    }

    setValidationMessages(msgs);
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
    setCardAssignments([]);
    setMyCard(null);
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
    if (!currentRoom) return;

    if (questions.length > players.length || (assignments.length === 0 && questions.length === players.length && players.length > 0)) {
      loadPlayers(currentRoom.id);
      loadQuestions(currentRoom.id);
    }
  }, [currentRoom, players.length, questions.length, assignments.length, loadPlayers, loadQuestions]);

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
            await reloadRoomState(room.id);
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
            await reloadRoomState(room.id);
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

          await reloadRoomState(currentRoom.id);
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "card_assignments",
        },
        async () => {
          if (!currentRoom) return;

          await reloadRoomState(currentRoom.id);
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joinCode, currentRoom, reloadRoomState]);
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

    if (players.length < 2) {
      alert('É necessário pelo menos 2 jogadores para distribuir perguntas.');
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
      const { error: asgErr } = await createAssignment(
        currentRoom.id,
        players[i].id,
        shuffledQuestions[i].id,
      );

      if (asgErr) {
        console.error('Erro ao criar assignment', asgErr);
        alert('Erro ao distribuir perguntas. Veja console para detalhes.');
        return;
      }
    }

    const { data } = await getAssignments(currentRoom.id);

    setAssignments(data || []);
    await loadMyQuestion();
    await loadResponses(currentRoom.id);
    alert("Perguntas distribuídas!");
  }

  async function handleDistributeCards() {
    if (!currentRoom) return;

    if (!isCreator || !currentPlayer) {
      alert("Apenas o criador da sala pode distribuir as fichas.");
      return;
    }

    if (cardAssignments.length > 0) {
      alert("Fichas já distribuídas.");
      return;
    }

    if (responses.length !== assignments.length) {
      alert("Nem todos responderam ainda.");
      return;
    }

    if (players.length < 2) {
      alert('É necessário pelo menos 2 jogadores para distribuir fichas.');
      return;
    }

    // Embaralha os assignments para distribuir como fichas
    const shuffledAssignments = [...assignments];
    let valid = false;

    while (!valid) {
      shuffledAssignments.sort(() => Math.random() - 0.5);

      valid = players.every(
        (player, index) => shuffledAssignments[index].player_id !== player.id,
      );
    }

    for (let i = 0; i < players.length; i++) {
      await createCardAssignment(
        currentRoom.id,
        players[i].id,
        shuffledAssignments[i].id,
      );
    }

    const { data } = await getCardAssignments(currentRoom.id);
    setCardAssignments(data || []);
    await loadMyCard();
    alert("Fichas distribuídas!");
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

  const canDistribute =
    isCreator && players.length > 0 && questions.length === players.length && assignments.length === 0;

  const distributeProblem = (() => {
    if (!isCreator) return "Você não é o criador.";
    if (assignments.length > 0) return "Perguntas já distribuídas.";
    if (players.length === 0) return "Ainda não há participantes.";
    if (questions.length < players.length) return `Faltam ${players.length - questions.length} pergunta(s).`;
    if (questions.length > players.length) return `Há mais perguntas do que jogadores (${questions.length} > ${players.length}).`;
    return null;
  })();

  const allAnswered = assignments.length > 0 && responses.length === assignments.length;

  const canDistributeCards =
    isCreator && allAnswered && cardAssignments.length === 0;

  const cardDistributeProblem = (() => {
    if (!isCreator) return "Você não é o criador.";
    if (cardAssignments.length > 0) return "Fichas já distribuídas.";
    if (assignments.length === 0) return "Perguntas ainda não foram distribuídas.";
    if (responses.length < assignments.length) return `Faltam ${assignments.length - responses.length} resposta(s).`;
    return null;
  })();

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
          {!isCreator && cardAssignments.length > 0 && !myCard && (
            <div style={{ marginTop: 8 }}>
              <button onClick={loadMyCard}>🔃 Carregar minha ficha</button>
            </div>
          )}
          {myCard && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={hideResponderName}
                  onChange={(e) => setHideResponderName(e.target.checked)}
                />
                Ocultar nome de quem respondeu
              </label>
            </div>
          )}
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

      {players.length > 0 && (
        <>
          <p>✅ Todos os participantes: {players.length}</p>

          {canDistribute ? (
            <>
              <p>✅ Todos os participantes enviaram suas perguntas!</p>
              <button onClick={handleDistributeQuestions}>🎲 Distribuir Perguntas</button>
            </>
          ) : (
            <>
              <p>Status: {distributeProblem}</p>
              {!isCreator && questions.length === players.length && assignments.length === 0 && (
                <p>Esperando o criador distribuir as perguntas...</p>
              )}
            </>
          )}

          <div style={{ marginTop: 8 }}>
            <button onClick={runValidation}>Executar Validação</button>
            {validationMessages.length > 0 && (
              <div style={{ marginTop: 8, padding: 8, border: "1px solid #eee" }}>
                {validationMessages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
          </div>
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

      <hr />

      {allAnswered && (
        <>
          <h2>Distribuir Fichas</h2>

          {canDistributeCards ? (
            <>
              <p>✅ Todos responderam suas perguntas!</p>
              <button onClick={handleDistributeCards}>🃏 Distribuir Fichas</button>
            </>
          ) : (
            <>
              <p>Status: {cardDistributeProblem}</p>
              {!isCreator && allAnswered && cardAssignments.length === 0 && (
                <p>Esperando o criador distribuir as fichas...</p>
              )}
            </>
          )}
        </>
      )}

      {/* Botão para entrantes carregarem manualmente sua ficha caso já tenha sido distribuída */}
      {currentPlayer && !isCreator && cardAssignments.length > 0 && !myCard && (
        <div style={{ marginTop: 12 }}>
          <button onClick={loadMyCard}>🔃 Carregar minha ficha</button>
        </div>
      )}

      {myCard && (
        <div style={{ marginTop: 24, padding: 16, border: "2px solid #2196F3" }}>
          <h2>🎴 Sua Ficha Recebida</h2>
          <p>Pergunta:</p>
          <strong>O que você faria se... {myCard.assignment && (
            (() => {
              const question = questions.find((q) => q.id === myCard.assignment.question_id);
              return question?.question_text;
            })()
          )}</strong>
          <p style={{ marginTop: 12 }}>Resposta:</p>
          <blockquote style={{ fontStyle: "italic", margin: "8px 0", padding: "8px 12px", borderLeft: "4px solid #2196F3" }}>
            {myCard.response.answer_text}
          </blockquote>
          <p style={{ marginTop: 12, fontSize: "0.9em", color: "#666" }}>
            Respondida por: {hideResponderName ? "Anônimo" : (() => {
              const responder = players.find((p) => p.id === myCard.response.player_id);
              return responder?.name || "Desconhecido";
            })()}
          </p>
        </div>
      )}
    </div>
  );
}
