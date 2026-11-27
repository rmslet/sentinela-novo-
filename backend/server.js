
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const DB_FILE = path.join(__dirname, 'db.json');

// Configuração do Socket.IO com suporte a CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"]
  }
});

// Middlewares para aceitar JSON e arquivos estáticos (HTML/CSS/JS)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Banco de dados em memória para testes do sistema
const bancoDados = {
  usuarios: [
    { id: 1, nome: "Administrador Geral", usuario: "admin", senha: "123", tipo: "admin" },
    { id: 2, nome: "Atendente Recepção", usuario: "atendimento", senha: "123", tipo: "atendimento" },
    { id: 3, nome: "Enfermeiro Triagem", usuario: "triagem", senha: "123", tipo: "triagem" },
    { id: 4, nome: "Dr. Médico Plantonista", usuario: "medico", senha: "123", tipo: "medico" },
    { id: 5, nome: "Farmacêutico Responsável", usuario: "medicacoes", senha: "123", tipo: "medicacoes" }
  ],
  atendimentos: [],
  triagens: [],
  consultas: [],
  listaMedicamentos: [
    "Dipirona 500mg",
    "Paracetamol 750mg",
    "Ibuprofeno 600mg",
    "Amoxicilina 500mg",
    "Omeprazol 20mg",
    "Soro Fisiológico 0.9%",
    "Buscopan Composto",
    "Dexametasona 4mg"
  ],
  tvChamadaAtual: null,
  tvHistorico: []
};

// ======================================================
// ROTAS DA API DE AUTENTICAÇÃO E NAVEGAÇÃO
// ======================================================

// Rota de Login
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body;

  const usuarioEncontrado = bancoDados.usuarios.find(
    u => u.usuario === usuario && u.senha === senha
  );

  if (!usuarioEncontrado) {
    return res.status(401).json({ erro: "Usuário ou senha incorretos." });
  }

  return res.json({
    sucesso: true,
    usuario: {
      id: usuarioEncontrado.id,
      nome: usuarioEncontrado.nome,
      usuario: usuarioEncontrado.usuario,
      tipo: usuarioEncontrado.tipo
    }
  });
});

// ======================================================
// ROTAS DO MÓDULO DE ATENDIMENTO / RECEPÇÃO
// ======================================================

app.get('/api/atendimento', (req, res) => {
  res.json(bancoDados.atendimentos);
});

app.post('/api/atendimento', (req, res) => {
  const novoPaciente = {
    id: Date.now(),
    ...req.body,
    dataHora: new Date()
  };

  bancoDados.atendimentos.push(novoPaciente);

  // Emite evento em tempo real para a tela de Triagem
  io.emit('atualizar_fila_atendimento', bancoDados.atendimentos);

  res.status(201).json({ sucesso: true, paciente: novoPaciente });
});

// ======================================================
// ROTAS DO MÓDULO DE TRIAGEM
// ======================================================

app.get('/api/triagem', (req, res) => {
  res.json(bancoDados.triagens);
});

app.post('/api/triagem', (req, res) => {
  const novaTriagem = {
    id: Date.now(),
    ...req.body,
    dataHora: new Date()
  };

  bancoDados.triagens.push(novaTriagem);

  // Remove da fila de espera da recepção
  bancoDados.atendimentos = bancoDados.atendimentos.filter(
    p => p.nome !== req.body.nome
  );

  // Emite eventos de atualização
  io.emit('atualizar_triagens', bancoDados.triagens);
  io.emit('atualizar_fila_atendimento', bancoDados.atendimentos);

  res.status(201).json({ sucesso: true, triagem: novaTriagem });
});

// ======================================================
// ROTAS DO PAINEL MÉDICO E MEDICAÇÕES
// ======================================================

app.get('/api/medicacoes/lista', (req, res) => {
  try {
    const medicamentosDisponiveis = lerBancoEstoque().estoque
      .filter(medicamento => Number(medicamento.quantidade) > 0)
      .map(({ id, nome, quantidade, unidade }) => ({
        id,
        nome,
        quantidade: Number(quantidade),
        unidade: unidade || 'unidades'
      }));
    return res.json(medicamentosDisponiveis);
  } catch (erro) {
    console.error('Erro ao carregar medicamentos do estoque:', erro);
    return res.status(500).json({ erro: 'Não foi possível carregar o estoque de medicamentos.' });
  }
});

app.get('/api/medicacoes/prescritas', (req, res) => {
  try {
    return res.json(lerBancoEstoque().consultas);
  } catch (erro) {
    console.error('Erro ao carregar prescrições:', erro);
    return res.status(500).json({ erro: 'Não foi possível carregar as prescrições.' });
  }
});

app.post('/api/consulta', (req, res) => {
  try {
    const db = lerBancoEstoque();
    const { paciente, diagnostico, medicamentoId, obs } = req.body;

    if (!paciente || medicamentoId === undefined || medicamentoId === null || medicamentoId === '') {
      return res.status(400).json({
        erro: 'Informe o paciente e selecione um medicamento do estoque.'
      });
    }

    const medicamento = db.estoque.find(
      item => String(item.id) === String(medicamentoId)
    );

    if (!medicamento) {
      return res.status(404).json({ erro: 'O medicamento selecionado não está cadastrado no estoque.' });
    }

    const estoqueAtual = Number(medicamento.quantidade);

    if (!Number.isInteger(estoqueAtual) || estoqueAtual < 0) {
      return res.status(500).json({ erro: 'A quantidade cadastrada para este medicamento é inválida.' });
    }

    if (estoqueAtual < 1) {
      return res.status(409).json({ erro: `Estoque insuficiente para prescrever ${medicamento.nome}.` });
    }

    medicamento.quantidade = estoqueAtual - 1;

    const novaConsulta = {
      id: Date.now(),
      paciente,
      diagnostico: diagnostico || '',
      medicacao: medicamento.nome,
      medicamentoId: medicamento.id,
      quantidadeDispensada: 1,
      unidade: medicamento.unidade || 'unidades',
      estoqueRestante: medicamento.quantidade,
      obs: obs || '',
      createdAt: new Date().toISOString(),
      dataHora: new Date()
    };

    db.consultas.push(novaConsulta);
    salvarBancoEstoque(db);
    bancoDados.consultas = db.consultas;

    bancoDados.triagens = bancoDados.triagens.filter(
      triagem => triagem.nome !== paciente
    );

    io.emit('atualizar_triagens', bancoDados.triagens);
    io.emit('atualizar_medicacoes', bancoDados.consultas);

    return res.status(201).json({ sucesso: true, consulta: novaConsulta });

  } catch (erro) {
    console.error('Erro ao registrar prescrição e descontar estoque:', erro);
    return res.status(500).json({ erro: 'Não foi possível registrar a prescrição e atualizar o estoque.' });
  }
});

// ======================================================
// ROTAS DA TV / PAINEL DE CHAMADAS
// ======================================================

app.get('/api/tv/chamada', (req, res) => {
  res.json({
    atual: bancoDados.tvChamadaAtual,
    historico: bancoDados.tvHistorico
  });
});

app.post('/api/tv/chamar', (req, res) => {
  const { paciente, localTipo, localNumero } = req.body;

  const horaFormatada = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const novaChamada = {
    id: Date.now(),
    paciente,
    localTipo: localTipo || "GUICHÊ",
    localNumero: localNumero || "01",
    hora: horaFormatada
  };

  bancoDados.tvChamadaAtual = novaChamada;
  bancoDados.tvHistorico.unshift(novaChamada);

  // Dispara o sinal de chamada para o painel da TV via WebSockets
  io.emit('nova_chamada_tv', {
    atual: bancoDados.tvChamadaAtual,
    historico: bancoDados.tvHistorico
  });

  res.json({ sucesso: true, chamada: novaChamada });
});

// ======================================================
// ROTAS DE ADMINISTRAÇÃO / GESTÃO DE USUÁRIOS
// ======================================================

app.get('/api/admin/usuarios', (req, res) => {
  res.json(bancoDados.usuarios);
});

app.post('/api/admin/usuarios', (req, res) => {
  const { nome, usuario, senha, tipo } = req.body;

  if (bancoDados.usuarios.some(u => u.usuario === usuario)) {
    return res.status(400).json({ erro: "Este nome de usuário já está cadastrado." });
  }

  const novoUsuario = {
    id: Date.now(),
    nome: nome || usuario,
    usuario,
    senha,
    tipo
  };

  bancoDados.usuarios.push(novoUsuario);

  res.status(201).json({ sucesso: true, usuario: novoUsuario });
});

app.delete('/api/admin/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);
  bancoDados.usuarios = bancoDados.usuarios.filter(u => u.id !== id);
  res.json({ sucesso: true });
});

// ROTAS DO ALMOXARIFADO
function lerBancoEstoque() {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  if (!Array.isArray(db.estoque)) db.estoque = [];
  if (!Array.isArray(db.consultas)) db.consultas = [];

  return db;
}

function salvarBancoEstoque(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

app.get('/estoque', (req, res) => {
  try {
    return res.json(lerBancoEstoque().estoque);
  } catch (erro) {
    console.error('Erro ao ler o estoque:', erro);
    return res.status(500).json({ erro: 'Não foi possível carregar o estoque.' });
  }
});

app.post('/estoque', (req, res) => {
  try {
    const db = lerBancoEstoque();
    const nome = String(req.body.nome || '').trim();
    const quantidade = Number(req.body.quantidade);

    const estoqueMinimo = req.body.estoqueMinimo === undefined
      ? 10
      : Number(req.body.estoqueMinimo);

    if (
      !nome ||
      !Number.isInteger(quantidade) ||
      quantidade <= 0 ||
      !Number.isInteger(estoqueMinimo) ||
      estoqueMinimo < 0
    ) {
      return res.status(400).json({
        erro: 'Informe o nome do item, uma quantidade inteira maior que zero e um mínimo inteiro igual ou maior que zero.'
      });
    }

    const medicamento = {
      id: Date.now(),
      nome,
      quantidade,
      estoqueMinimo,
      unidade: String(req.body.unidade || 'unidades'),
      categoria: String(req.body.categoria || 'geral')
    };

    db.estoque.push(medicamento);
    salvarBancoEstoque(db);

    return res.status(201).json({
      mensagem: 'Item adicionado ao estoque.',
      medicamento
    });

  } catch (erro) {
    console.error('Erro ao cadastrar item no estoque:', erro);
    return res.status(500).json({ erro: 'Não foi possível cadastrar o item.' });
  }
});

app.patch('/estoque/:id', (req, res) => {
  try {
    const db = lerBancoEstoque();

    const medicamento = db.estoque.find(
      item => String(item.id) === req.params.id
    );

    if (!medicamento) {
      return res.status(404).json({ erro: 'Item não encontrado no estoque.' });
    }

    const quantidade = Number(req.body.quantidade);

    if (
      req.body.quantidade === undefined ||
      req.body.quantidade === null ||
      req.body.quantidade === '' ||
      !Number.isInteger(quantidade)
    ) {
      return res.status(400).json({ erro: 'Informe uma quantidade inteira.' });
    }

    const novaQuantidade = Number(medicamento.quantidade) + quantidade;

    if (novaQuantidade < 0) {
      return res.status(400).json({
        erro: 'A quantidade removida não pode ser maior que o estoque disponível.'
      });
    }

    medicamento.quantidade = novaQuantidade;
    salvarBancoEstoque(db);

    return res.json({ mensagem: 'Estoque atualizado.', medicamento });

  } catch (erro) {
    console.error('Erro ao ajustar estoque:', erro);
    return res.status(500).json({ erro: 'Não foi possível ajustar o estoque.' });
  }
});

app.delete('/estoque/:id', (req, res) => {
  try {
    const db = lerBancoEstoque();

    const index = db.estoque.findIndex(
      item => String(item.id) === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({ erro: 'Item não encontrado no estoque.' });
    }

    db.estoque.splice(index, 1);
    salvarBancoEstoque(db);

    return res.json({ mensagem: 'Item removido do estoque.' });

  } catch (erro) {
    console.error('Erro ao remover item do estoque:', erro);
    return res.status(500).json({ erro: 'Não foi possível remover o item.' });
  }
});

// Evento de conexão do Socket.IO
io.on('connection', (socket) => {
  console.log(`Cliente conectado via WebSocket: ${socket.id}`);
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('====================================================');
  console.log('🏥 Hospital Santa Cecília - Servidor Ativo');
  console.log(`🌐 Servidor iniciado na porta ${PORT}`);
  console.log('====================================================');
});
