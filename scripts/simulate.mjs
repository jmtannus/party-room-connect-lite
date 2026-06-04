import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path = '.env') {
  try {
    const txt = readFileSync(path, 'utf8');
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const env = {};
    for (const l of lines) {
      const idx = l.indexOf('=');
      if (idx > 0) {
        const k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        env[k] = v;
      }
    }
    return env;
  } catch (e) {
    return {};
  }
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase credentials not found in .env or environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function randCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

async function run() {
  console.log('Iniciando simulação...');

  const code = randCode();
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({ code, status: 'waiting' })
    .select()
    .single();

  if (roomErr) {
    console.error('Erro criando sala:', roomErr);
    process.exit(1);
  }

  console.log('Sala criada:', room.code, room.id);

  const names = ['Alice', 'Bruno', 'Carla', 'Diego'];

  const players = [];
  for (const name of names) {
    const { data: p, error: pErr } = await supabase
      .from('players')
      .insert({ room_id: room.id, name })
      .select()
      .single();

    if (pErr) {
      console.error('Erro criando player', name, pErr);
      process.exit(1);
    }
    players.push(p);
  }

  console.log('Players criados:', players.map((p) => p.name).join(', '));

  const questions = [];
  for (const p of players) {
    const { data: q, error: qErr } = await supabase
      .from('questions')
      .insert({ room_id: room.id, player_id: p.id, question_text: `Pergunta do ${p.name}` })
      .select()
      .single();

    if (qErr) {
      console.error('Erro criando pergunta para', p.name, qErr);
      process.exit(1);
    }
    questions.push(q);
  }

  console.log('Perguntas enviadas:', questions.length);

  // Distribuir perguntas garantindo que ninguém receba a própria pergunta
  const shuffled = [...questions];
  let valid = false;
  let attempts = 0;
  while (!valid && attempts < 1000) {
    shuffle(shuffled);
    valid = players.every((player, index) => shuffled[index].player_id !== player.id);
    attempts++;
  }

  if (!valid) {
    console.warn('Não foi possível gerar distribuição sem conflito após 1000 tentativas. Saindo.');
    process.exit(1);
  }

  const assignments = [];
  for (let i = 0; i < players.length; i++) {
    const { data: a, error: aErr } = await supabase
      .from('assignments')
      .insert({ room_id: room.id, player_id: players[i].id, question_id: shuffled[i].id })
      .select()
      .single();

    if (aErr) {
      console.error('Erro criando assignment:', aErr);
      process.exit(1);
    }
    assignments.push(a);
  }

  console.log('Assignments criados:');
  for (const a of assignments) {
    const player = players.find((p) => p.id === a.player_id);
    const question = questions.find((q) => q.id === a.question_id);
    const author = players.find((p) => p.id === question.player_id);
    console.log(`- ${player.name} <- "${question.question_text}" (criada por ${author.name})`);
  }

  console.log('Simulação concluída.');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
