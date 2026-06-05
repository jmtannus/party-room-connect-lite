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
  is_anonymous?: boolean;
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
  const [isAnswerAnonymous, setIsAnswerAnonymous] = useState(false);
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

    reloadRoomState(currentRoom.id);

    const interval = setInterval(() => {
      reloadRoomState(currentRoom.id);
    }, 3000);

    return () => clearInterval(interval);
  }, [currentRoom, reloadRoomState]);

  useEffect(() => {
    if (currentPlayer && currentRoom) {
      loadMyQuestion();
      loadMyCard();
    }
  }, [currentPlayer, currentRoom, loadMyQuestion, loadMyCard]);

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

    if (assignments.length < players.length) {
      alert("Erro: O número de perguntas atribuídas é menor que o número de jogadores.");
      return;
    }

    // Embaralha os assignments para distribuir como fichas
    const shuffledAssignments = [...assignments];
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 1000) {
      shuffledAssignments.sort(() => Math.random() - 0.5);
      attempts++;

      valid = players.every((player, index) => {
        const asg = shuffledAssignments[index];
        const question = questions.find((q) => q.id === asg.question_id);
        
        // A resposta não pode ser do próprio jogador
        const isNotOwnResponse = asg.player_id !== player.id;
        
        // A pergunta não pode ser do próprio jogador (se houver mais de 2 jogadores na sala)
        const isNotOwnQuestion = players.length > 2 && question
          ? question.player_id !== player.id
          : true;

        return isNotOwnResponse && isNotOwnQuestion;
      });
    }

    // Se após 1000 tentativas não conseguirmos evitar a própria pergunta (ou se só há 2 jogadores),
    // garantimos pelo menos que a resposta não seja da própria pessoa.
    if (!valid) {
      valid = false;
      attempts = 0;
      while (!valid && attempts < 1000) {
        shuffledAssignments.sort(() => Math.random() - 0.5);
        attempts++;
        valid = players.every(
          (player, index) => shuffledAssignments[index].player_id !== player.id,
        );
      }
    }

    const errors: string[] = [];

    for (let i = 0; i < players.length; i++) {
      const asg = shuffledAssignments[i];
      if (!asg) continue;

      const { error: insertErr } = await createCardAssignment(
        currentRoom.id,
        players[i].id,
        asg.id,
      );
      if (insertErr) {
        errors.push(insertErr.message);
      }
    }

    if (errors.length > 0) {
      console.error("Erros ao criar card_assignments:", errors);
      alert(`Erro ao distribuir fichas no banco de dados:\n${errors[0]}`);
      return;
    }

    const { data, error: fetchErr } = await getCardAssignments(currentRoom.id);
    if (fetchErr) {
      console.error("Erro ao buscar card_assignments:", fetchErr);
      alert(`Erro ao carregar fichas distribuídas: ${fetchErr.message}`);
      return;
    }

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
      isAnswerAnonymous,
    );

    if (error) {
      console.error(error);
      return;
    }

    setAnswerText("");
    setIsAnswerAnonymous(false);
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
    <div className="container">
      <header className="app-header">
        <h1 className="app-title">🎲 Party Room Connect</h1>
        <p className="app-subtitle">Sem papel e caneta. Apenas risadas! ⚡</p>
      </header>

      {/* TELA INICIAL: ENTRAR / CRIAR SALA */}
      {!currentPlayer && (
        <div className="glass-card">
          <h2>🚪 Entrar em uma Sala</h2>
          <input
            className="input-field"
            placeholder="CÓDIGO DA SALA (Ex: QQU5Y7)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <input
            className="input-field"
            placeholder="Seu nome ou apelido"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button 
            className="btn btn-primary" 
            onClick={handleJoinRoom} 
            disabled={!joinCode || !playerName.trim()}
          >
            Entrar na Sala
          </button>

          <div className="divider" />

          <h2>✨ Ou crie a sua</h2>
          <button className="btn btn-secondary" onClick={handleCreateRoom}>
            Criar Nova Sala
          </button>
          
          {roomCode && (
            <div className="room-code-box" style={{ marginTop: 10 }}>
              <div className="room-code-title">Sua Sala foi Criada!</div>
              <div className="room-code-number">{roomCode}</div>
              <p style={{ fontSize: 12, marginTop: 6, color: "var(--text-muted)", fontWeight: 500 }}>
                Compartilhe o código acima para os amigos entrarem.
              </p>
            </div>
          )}
        </div>
      )}

      {/* PAINEL DO JOGADOR LOGADO */}
      {currentPlayer && (
        <>
          {/* Card de Identificação */}
          <div className="glass-card">
            <div className="room-code-box">
              <div className="room-code-title">Código da Sala</div>
              <div className="room-code-number">{currentRoom?.code}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Você está como:</span>
                <h2 style={{ fontSize: 20, marginTop: 2 }}>👤 {currentPlayer.name}</h2>
                <span style={{ fontSize: 12, color: "var(--primary-hover)", fontWeight: 700 }}>
                  {isCreator ? "👑 CRIADOR DA SALA" : "🎮 JOGADOR"}
                </span>
              </div>
              <button className="btn btn-danger" style={{ width: "auto", padding: "10px 16px" }} onClick={handleLeave}>
                Sair
              </button>
            </div>
          </div>

          {/* Participantes na sala */}
          <div className="glass-card">
            <h2>👥 Participantes ({players.length})</h2>
            <div className="players-badge-container">
              {players.map((p) => (
                <span className="player-badge" key={p.id}>
                  {p.name}
                </span>
              ))}
            </div>
            
            <div className="divider" />
            
            <p style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 500 }}>
              Perguntas enviadas: <strong>{questions.length} de {players.length}</strong>
            </p>

            {players.length > 0 && (
              <div style={{ marginTop: 5 }}>
                {canDistribute ? (
                  <>
                    <div className="status-msg status-success" style={{ marginBottom: 12 }}>
                      🎉 Todos enviaram as perguntas! Pronto para jogar.
                    </div>
                    <button className="btn btn-primary" onClick={handleDistributeQuestions}>
                      🎲 Distribuir Perguntas
                    </button>
                  </>
                ) : (
                  <div>
                    {assignments.length > 0 ? (
                      <div className="status-msg status-success">
                        ✅ Perguntas já foram distribuídas!
                      </div>
                    ) : (
                      <div className="status-msg status-warning">
                        ⏳ {distributeProblem || (!isCreator && "Esperando o criador iniciar a distribuição...")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Painel de Validação e Debug */}
            <div style={{ marginTop: 5 }}>
              <button className="btn btn-secondary" style={{ padding: "8px 12px", fontSize: 12, width: "auto" }} onClick={runValidation}>
                🔎 Validar Sala
              </button>
              {validationMessages.length > 0 && (
                <div className="validation-box" style={{ marginTop: 10 }}>
                  {validationMessages.map((m, i) => (
                    <div className="validation-item" key={i}>• {m}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Enviar / Responder Pergunta */}
          <div className="glass-card">
            <h2>✍️ Sua Pergunta</h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
              Escreva uma pergunta curiosa ou engraçada completando a frase: <br />
              <strong>O que você faria se...</strong>
            </p>
            <input
              className="input-field"
              placeholder="ganhasse na loteria? / sumisse do mapa?"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleSendQuestion}
              disabled={!questionText.trim()}
            >
              Enviar Pergunta
            </button>

            {/* Pergunta Recebida */}
            {myQuestion && (
              <div className="game-card question-card">
                <div className="card-title">❓ Pergunta Recebida</div>
                <div className="card-question-text">O que você faria se... {myQuestion.question_text}</div>

                {assignments.length === players.length && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 15 }}>
                    <p style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 500 }}>Escreva sua resposta:</p>
                    <input
                      className="input-field"
                      placeholder="Sua resposta mais criativa..."
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      disabled={hasAnswered}
                    />
                    {!hasAnswered && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={isAnswerAnonymous}
                          onChange={(e) => setIsAnswerAnonymous(e.target.checked)}
                        />
                        Responder de forma anônima 🤫
                      </label>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={handleSendAnswer}
                      disabled={hasAnswered || !answerText.trim()}
                    >
                      Enviar Resposta
                    </button>
                    {hasAnswered && (
                      <p style={{ fontSize: 13, color: "#86efac", fontWeight: "700", textAlign: "center" }}>
                        ✅ Resposta enviada!
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Distribuição de Fichas (Fase Final) */}
          {allAnswered && (
            <div className="glass-card">
              <h2>🃏 Distribuição de Fichas</h2>
              {canDistributeCards ? (
                <>
                  <div className="status-msg status-success" style={{ marginBottom: 12 }}>
                    🎉 Todos responderam as perguntas! Pronto para revelar as fichas.
                  </div>
                  <button className="btn btn-primary" onClick={handleDistributeCards}>
                    🃏 Distribuir Fichas
                  </button>
                </>
              ) : (
                <div className="status-msg status-warning">
                  ⏳ {cardDistributeProblem || (!isCreator && "Esperando o criador distribuir as fichas...")}
                </div>
              )}
            </div>
          )}

          {/* Botões de Recarga Manual para Jogadores */}
          {!isCreator && assignments.length > 0 && !myQuestion && (
            <button className="btn btn-secondary" onClick={loadMyQuestion}>
              🔃 Sincronizar Minha Pergunta
            </button>
          )}

          {!isCreator && cardAssignments.length > 0 && !myCard && (
            <button className="btn btn-secondary" onClick={loadMyCard}>
              🔃 Sincronizar Minha Ficha
            </button>
          )}

          {/* Ficha Revelada (O Grande Momento!) */}
          {myCard && (
            <div className="game-card ficha-card">
              <div className="card-title">🎴 Sua Ficha Revelada</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Leia esta pergunta para o amigo do lado direito, e ele deve responder com a resposta abaixo!
              </p>
              <div className="card-question-text">
                O que você faria se... {myCard.assignment && (
                  (() => {
                    const question = questions.find((q) => q.id === myCard.assignment.question_id);
                    return question?.question_text || "...";
                  })()
                )}
              </div>
              <div className="card-answer-text">
                {myCard.response.answer_text}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 15 }}>
                <label className="checkbox-label" style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={hideResponderName}
                    onChange={(e) => setHideResponderName(e.target.checked)}
                  />
                  Ocultar nome
                </label>
                <div className="card-meta">
                  Por: {myCard.response.is_anonymous || hideResponderName ? "Anônimo 🤫" : (() => {
                    const responder = players.find((p) => p.id === myCard.response.player_id);
                    return responder?.name || "Desconhecido";
                  })()}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
