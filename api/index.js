const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "../backend/db.json");

function criarDBPadrao() {
  return {
    usuarios: [], pacientes: [], triagens: [], consultas: [], estoque: [],
    altas: [], internacoes: [], tv_chamada: null, tv_historico: []
  };
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const db = criarDBPadrao();
    writeDB(db);
    return db;
  }
  let db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (erro) {
    throw new Error("O arquivo backend/db.json contém JSON inválido.");
  }
  for (const [chave, valor] of Object.entries(criarDBPadrao())) {
    if (db[chave] === undefined) db[chave] = valor;
  }
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function responderErro(res, erro) {
  console.error(erro);
  return res.status(500).json({ erro: "Erro interno do servidor." });
}

// Estoque
app.get("/estoque", (req, res) => {
  try { return res.json(readDB().estoque); }
  catch (erro) { return responderErro(res, erro); }
});

app.post("/estoque", (req, res) => {
  try {
    const db = readDB();
    const nome = String(req.body?.nome || "").trim();
    const quantidade = Number(req.body?.quantidade);
    const estoqueMinimo = req.body?.estoqueMinimo === undefined ? 10 : Number(req.body.estoqueMinimo);
    if (!nome || !Number.isInteger(quantidade) || quantidade <= 0 || !Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
      return res.status(400).json({ erro: "Informe o nome do item, uma quantidade inteira maior que zero e um mínimo inteiro igual ou maior que zero." });
    }
    const medicamento = {
      id: Date.now(), nome, quantidade, estoqueMinimo,
      unidade: String(req.body.unidade || "unidades"),
      categoria: String(req.body.categoria || "geral")
    };
    db.estoque.push(medicamento);
    writeDB(db);
    return res.status(201).json({ mensagem: "Item adicionado ao estoque.", medicamento });
  } catch (erro) { return responderErro(res, erro); }
});

app.patch("/estoque/:id", (req, res) => {
  try {
    const db = readDB();
    const medicamento = db.estoque.find(item => String(item.id) === req.params.id);
    if (!medicamento) return res.status(404).json({ erro: "Item não encontrado no estoque." });
    const quantidade = Number(req.body?.quantidade);
    if (req.body?.quantidade === undefined || req.body.quantidade === null || req.body.quantidade === "" || !Number.isInteger(quantidade)) {
      return res.status(400).json({ erro: "Informe uma quantidade inteira." });
    }
    const novaQuantidade = Number(medicamento.quantidade) + quantidade;
    if (novaQuantidade < 0) return res.status(400).json({ erro: "A quantidade removida não pode ser maior que o estoque disponível." });
    medicamento.quantidade = novaQuantidade;
    writeDB(db);
    return res.json({ mensagem: "Estoque atualizado.", medicamento });
  } catch (erro) { return responderErro(res, erro); }
});

app.delete("/estoque/:id", (req, res) => {
  try {
    const db = readDB();
    const index = db.estoque.findIndex(item => String(item.id) === req.params.id);
    if (index === -1) return res.status(404).json({ erro: "Item não encontrado no estoque." });
    db.estoque.splice(index, 1);
    writeDB(db);
    return res.json({ mensagem: "Item removido do estoque." });
  } catch (erro) { return responderErro(res, erro); }
});

// Login
app.post("/login", (req, res) => {
  try {
    const db = readDB();
    const { usuario, senha } = req.body || {};
    const encontrado = db.usuarios.find(item => item.usuario === usuario && item.senha === senha);
    if (!encontrado) return res.status(401).json({ erro: "Login inválido" });
    return res.json(encontrado);
  } catch (erro) { return responderErro(res, erro); }
});

// Administração de usuários. A senha nunca é incluída nas respostas de listagem.
app.get(["/admin/usuarios", "/api/admin/usuarios"], (req, res) => {
  try {
    const usuarios = readDB().usuarios.map(usuario => ({
      id: usuario.id ?? usuario.usuario,
      nome: usuario.nome || usuario.usuario,
      usuario: usuario.usuario,
      tipo: usuario.tipo || ""
    }));
    return res.json(usuarios);
  } catch (erro) { return responderErro(res, erro); }
});

app.post(["/admin/usuarios", "/api/admin/usuarios"], (req, res) => {
  try {
    const db = readDB();
    const nome = String(req.body?.nome || "").trim();
    const usuario = String(req.body?.usuario || "").trim();
    const senha = String(req.body?.senha || "");
    const tipo = String(req.body?.tipo || "").trim();
    if (!nome || !usuario || !senha || !tipo) {
      return res.status(400).json({ erro: "Preencha nome, usuário, senha e perfil." });
    }
    if (db.usuarios.some(item => String(item.usuario).toLowerCase() === usuario.toLowerCase())) {
      return res.status(409).json({ erro: "Este nome de usuário já está cadastrado." });
    }
    const novoUsuario = { id: Date.now(), nome, usuario, senha, tipo };
    db.usuarios.push(novoUsuario);
    writeDB(db);
    return res.status(201).json({ sucesso: true, usuario: { id: novoUsuario.id, nome, usuario, tipo } });
  } catch (erro) { return responderErro(res, erro); }
});

app.delete(["/admin/usuarios/:id", "/api/admin/usuarios/:id"], (req, res) => {
  try {
    const db = readDB();
    const index = db.usuarios.findIndex(item => String(item.id ?? item.usuario) === req.params.id);
    if (index === -1) return res.status(404).json({ erro: "Usuário não encontrado." });
    db.usuarios.splice(index, 1);
    writeDB(db);
    return res.json({ sucesso: true });
  } catch (erro) { return responderErro(res, erro); }
});

// Atendimento de pacientes
app.post("/atendimento", (req, res) => {
  try {
    const db = readDB();
    const { nome, cpf, tipo } = req.body || {};
    if (!nome || !cpf || !tipo) return res.status(400).json({ erro: "Preencha nome, CPF e tipo de atendimento." });
    const paciente = {
      id: Date.now(), nome, cpf, tipo,
      dataNascimento: req.body.dataNascimento || "", sexo: req.body.sexo || "",
      nomeMae: req.body.nomeMae || "", estadoCivil: req.body.estadoCivil || "",
      endereco: req.body.endereco || "", telefone: req.body.telefone || "",
      email: req.body.email || "", contatoEmergencia: req.body.contatoEmergencia || "",
      status: "triagem", createdAt: new Date().toISOString()
    };
    db.pacientes.push(paciente);
    writeDB(db);
    return res.status(201).json({ sucesso: true, paciente });
  } catch (erro) { return responderErro(res, erro); }
});

app.get("/atendimento", (req, res) => {
  try { return res.json(readDB().pacientes.filter(paciente => paciente.status === "triagem")); }
  catch (erro) { return responderErro(res, erro); }
});

// Triagem
app.post("/triagem", (req, res) => {
  try {
    const db = readDB();
    const { nome, sintoma, temperatura, alergia, observacao } = req.body || {};
    if (!nome || !sintoma) return res.status(400).json({ erro: "Informe o nome do paciente e o sintoma." });
    const temp = Number(temperatura);
    const sintomaNormalizado = String(sintoma).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const vermelhos = ["infarto", "avc", "convulsao", "hemorragia", "falta_ar_grave"];
    const amarelos = ["febre", "vomito", "diarreia", "falta_ar_moderada"];
    let risco = String(req.body.risco || "verde").toLowerCase();
    if (vermelhos.some(item => sintomaNormalizado.includes(item)) || (Number.isFinite(temp) && temp >= 39)) risco = "vermelho";
    else if ((Number.isFinite(temp) && temp >= 38) || amarelos.some(item => sintomaNormalizado.includes(item))) risco = "amarelo";
    else if (!["verde", "amarelo", "vermelho"].includes(risco)) risco = "verde";
    const triagem = { id: Date.now(), nome, sintoma, temperatura: temperatura ?? "", alergia: alergia || "", observacao: observacao || "", risco, status: "aguardando_medico", createdAt: new Date().toISOString() };
    db.triagens.push(triagem);
    const paciente = db.pacientes.find(item => String(item.nome).trim().toLowerCase() === String(nome).trim().toLowerCase() && item.status === "triagem");
    if (paciente) { paciente.status = "triado"; paciente.triagemId = triagem.id; }
    writeDB(db);
    return res.status(201).json(triagem);
  } catch (erro) { return responderErro(res, erro); }
});

app.get("/triagens", (req, res) => {
  try { return res.json(readDB().triagens); }
  catch (erro) { return responderErro(res, erro); }
});

app.get(["/lista-medicacoes", "/api/medicacoes/lista"], (req, res) => {
  try {
    const disponiveis = readDB().estoque.filter(item => Number(item.quantidade) > 0).map(({ id, nome, quantidade, unidade }) => ({ id, nome, quantidade: Number(quantidade), unidade: unidade || "unidades" }));
    return res.json(disponiveis);
  } catch (erro) { return responderErro(res, erro); }
});

app.post(["/consulta", "/api/consulta"], (req, res) => {
  try {
    const db = readDB();
    const { paciente, diagnostico, medicamentoId, obs } = req.body || {};
    if (!paciente || medicamentoId === undefined || medicamentoId === null || medicamentoId === "") return res.status(400).json({ erro: "Informe o paciente e selecione um medicamento do estoque." });
    const medicamento = db.estoque.find(item => String(item.id) === String(medicamentoId));
    if (!medicamento) return res.status(404).json({ erro: "O medicamento selecionado não está cadastrado no estoque." });
    const quantidade = Number(medicamento.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 0) return res.status(500).json({ erro: "A quantidade cadastrada para este medicamento é inválida." });
    if (quantidade < 1) return res.status(409).json({ erro: `Estoque insuficiente para prescrever ${medicamento.nome}.` });
    medicamento.quantidade = quantidade - 1;
    const consulta = { id: Date.now(), paciente, diagnostico: diagnostico || "", medicacao: medicamento.nome, medicamentoId: medicamento.id, quantidadeDispensada: 1, unidade: medicamento.unidade || "unidades", estoqueRestante: medicamento.quantidade, obs: obs || "", createdAt: new Date().toISOString() };
    db.consultas.push(consulta);
    writeDB(db);
    return res.status(201).json({ sucesso: true, consulta });
  } catch (erro) { return responderErro(res, erro); }
});

app.get(["/medicacoes", "/api/medicacoes/prescritas"], (req, res) => {
  try { return res.json(readDB().consultas); }
  catch (erro) { return responderErro(res, erro); }
});

app.get("/tv/chamada", (req, res) => {
  try { const db = readDB(); return res.json({ chamada: db.tv_chamada || null, historico: db.tv_historico || [] }); }
  catch (erro) { return responderErro(res, erro); }
});

app.post("/tv/chamar", (req, res) => {
  try {
    const db = readDB();
    const { paciente, localTipo, localNumero } = req.body || {};
    if (!paciente) return res.status(400).json({ erro: "Informe o nome do paciente." });
    const chamada = { id: Date.now(), paciente, localTipo: localTipo || "Consultório", localNumero: localNumero || "1", createdAt: new Date().toISOString() };
    db.tv_chamada = chamada;
    db.tv_historico.unshift(chamada);
    db.tv_historico = db.tv_historico.slice(0, 20);
    writeDB(db);
    return res.status(201).json(chamada);
  } catch (erro) { return responderErro(res, erro); }
});

app.post("/alta", (req, res) => {
  try {
    const db = readDB();
    const { paciente, tipoAlta, motivo, orientacoes, observacoes } = req.body || {};
    if (!paciente) return res.status(400).json({ erro: "Informe o paciente." });
    const alta = { id: Date.now(), paciente, tipoAlta: tipoAlta || "Alta médica", motivo: motivo || "", orientacoes: orientacoes || "", observacoes: observacoes || "", createdAt: new Date().toISOString() };
    db.altas.push(alta); writeDB(db); return res.status(201).json(alta);
  } catch (erro) { return responderErro(res, erro); }
});

app.get("/altas", (req, res) => {
  try { return res.json(readDB().altas); }
  catch (erro) { return responderErro(res, erro); }
});

app.post("/internacao", (req, res) => {
  try {
    const db = readDB();
    const { paciente, leito } = req.body || {};
    if (!paciente || !leito) return res.status(400).json({ erro: "Informe o paciente e o número do leito." });
    const internacao = { id: Date.now(), paciente, leito, status: "internado", createdAt: new Date().toISOString() };
    db.internacoes.push(internacao);
    const registro = db.pacientes.find(item => String(item.nome).trim().toLowerCase() === String(paciente).trim().toLowerCase());
    if (registro) { registro.status = "internado"; registro.leito = leito; }
    writeDB(db); return res.status(201).json(internacao);
  } catch (erro) { return responderErro(res, erro); }
});

app.get("/internacao", (req, res) => {
  try { return res.json(readDB().internacoes.filter(item => item.status === "internado")); }
  catch (erro) { return responderErro(res, erro); }
});

module.exports = app;
if (require.main === module) app.listen(PORT, () => console.log(`Hospital Santa Cecília rodando em http://localhost:${PORT}`));
