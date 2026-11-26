
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIGURAÇÕES
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// FRONTEND
app.use(express.static(path.join(__dirname, "../frontend")));

// Mantém o banco de dados na pasta backend
const DB_FILE = path.join(__dirname, "../backend/db.json");

// BANCO PADRÃO
function criarDBPadrao() {
  return {
    usuarios: [],
    pacientes: [],
    triagens: [],
    consultas: [],
    estoque: [],
    altas: [],
    internacoes: [],
    tv_chamada: null,
    tv_historico: []
  };
}

// LEITURA DO BANCO
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

  const padrao = criarDBPadrao();

  for (const chave of Object.keys(padrao)) {
    if (db[chave] === undefined) {
      db[chave] = padrao[chave];
    }
  }

  return db;
}

// GRAVAÇÃO DO BANCO
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ESTOQUE
app.get("/estoque", (req, res) => {
  try {
    const db = readDB();
    return res.json(db.estoque);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

app.post("/estoque", (req, res) => {
  try {
    const db = readDB();
    const nome = String(req.body.nome || "").trim();
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
        erro: "Informe o nome do item, uma quantidade inteira maior que zero e um mínimo inteiro igual ou maior que zero."
      });
    }

    const medicamento = {
      id: Date.now(),
      nome,
      quantidade,
      estoqueMinimo,
      unidade: String(req.body.unidade || "unidades"),
      categoria: String(req.body.categoria || "geral")
    };

    db.estoque.push(medicamento);
    writeDB(db);

    return res.status(201).json({
      mensagem: "Item adicionado ao estoque.",
      medicamento
    });
  } catch (erro) {
    return responderErro(res, erro);
  }
});

app.patch("/estoque/:id", (req, res) => {
  try {
    const db = readDB();
    const medicamento = db.estoque.find(
      item => String(item.id) === req.params.id
    );

    if (!medicamento) {
      return res.status(404).json({ erro: "Item não encontrado no estoque." });
    }

    const quantidade = Number(req.body.quantidade);
    if (
      req.body.quantidade === undefined ||
      req.body.quantidade === null ||
      req.body.quantidade === "" ||
      !Number.isInteger(quantidade)
    ) {
      return res.status(400).json({ erro: "Informe uma quantidade inteira." });
    }

    const novaQuantidade = Number(medicamento.quantidade) + quantidade;
    if (novaQuantidade < 0) {
      return res.status(400).json({
        erro: "A quantidade removida não pode ser maior que o estoque disponível."
      });
    }

    medicamento.quantidade = novaQuantidade;
    writeDB(db);

    return res.json({
      mensagem: "Estoque atualizado.",
      medicamento
    });
  } catch (erro) {
    return responderErro(res, erro);
  }
});

app.delete("/estoque/:id", (req, res) => {
  try {
    const db = readDB();
    const index = db.estoque.findIndex(
      item => String(item.id) === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({ erro: "Item não encontrado no estoque." });
    }

    db.estoque.splice(index, 1);
    writeDB(db);

    return res.json({ mensagem: "Item removido do estoque." });
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// TRATAMENTO DE ERROS
function responderErro(res, erro) {
  console.error(erro);
  return res.status(500).json({
    erro: "Erro interno do servidor."
  });
}

// LOGIN
app.post("/login", (req, res) => {
  try {
    const db = readDB();
    const { usuario, senha } = req.body;

    const user = db.usuarios.find(
      u => u.usuario === usuario && u.senha === senha
    );

    if (!user) {
      return res.status(401).json({
        erro: "Login inválido"
      });
    }

    return res.json(user);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// CADASTRAR PACIENTE
app.post("/atendimento", (req, res) => {
  try {
    const db = readDB();
    const { nome, cpf, tipo } = req.body;

    if (!nome || !cpf || !tipo) {
      return res.status(400).json({
        erro: "Preencha nome, CPF e tipo de atendimento."
      });
    }

    const paciente = {
      id: Date.now(),
      nome,
      cpf,
      tipo,
      dataNascimento: req.body.dataNascimento || "",
      sexo: req.body.sexo || "",
      nomeMae: req.body.nomeMae || "",
      estadoCivil: req.body.estadoCivil || "",
      endereco: req.body.endereco || "",
      telefone: req.body.telefone || "",
      email: req.body.email || "",
      contatoEmergencia: req.body.contatoEmergencia || "",
      status: "triagem",
      createdAt: new Date().toISOString()
    };

    db.pacientes.push(paciente);
    writeDB(db);

    return res.status(201).json(paciente);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// LISTAR PACIENTES AGUARDANDO TRIAGEM
app.get("/atendimento", (req, res) => {
  try {
    const db = readDB();

    const pacientes = db.pacientes.filter(
      paciente => paciente.status === "triagem"
    );

    return res.json(pacientes);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// REGISTRAR TRIAGEM
app.post("/triagem", (req, res) => {
  try {
    const db = readDB();
    const {
      nome,
      sintoma,
      temperatura,
      alergia,
      observacao
    } = req.body;

    if (!nome || !sintoma) {
      return res.status(400).json({
        erro: "Informe o nome do paciente e o sintoma."
      });
    }

    const temp = Number(temperatura);
    let risco = String(req.body.risco || "verde").toLowerCase();

    const sintomasVermelhos = [
      "infarto",
      "avc",
      "convulsao",
      "hemorragia",
      "falta_ar_grave"
    ];

    const sintomasAmarelos = [
      "febre",
      "vomito",
      "diarreia",
      "falta_ar_moderada"
    ];

    const sintomaNormalizado = String(sintoma)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (
      sintomasVermelhos.some(s => sintomaNormalizado.includes(s)) ||
      (Number.isFinite(temp) && temp >= 39)
    ) {
      risco = "vermelho";
    } else if (
      (Number.isFinite(temp) && temp >= 38) ||
      sintomasAmarelos.some(s => sintomaNormalizado.includes(s))
    ) {
      risco = "amarelo";
    } else if (!["verde", "amarelo", "vermelho"].includes(risco)) {
      risco = "verde";
    }

    const triagem = {
      id: Date.now(),
      nome,
      sintoma,
      temperatura: temperatura ?? "",
      alergia: alergia || "",
      observacao: observacao || "",
      risco,
      status: "aguardando_medico",
      createdAt: new Date().toISOString()
    };

    db.triagens.push(triagem);

    // Atualiza o paciente correspondente no atendimento.
    const paciente = db.pacientes.find(
      p =>
        String(p.nome).trim().toLowerCase() ===
          String(nome).trim().toLowerCase() &&
        p.status === "triagem"
    );

    if (paciente) {
      paciente.status = "triado";
      paciente.triagemId = triagem.id;
    }

    writeDB(db);

    return res.status(201).json(triagem);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  try {
    const db = readDB();
    return res.json(db.triagens);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// LISTA DE MEDICAÇÕES DISPONÍVEIS
app.get(["/lista-medicacoes", "/api/medicacoes/lista"], (req, res) => {
  try {
    const db = readDB();
    const medicamentosDisponiveis = db.estoque
      .filter(medicamento => Number(medicamento.quantidade) > 0)
      .map(({ id, nome, quantidade, unidade }) => ({
        id,
        nome,
        quantidade: Number(quantidade),
        unidade: unidade || "unidades"
      }));

    return res.json(medicamentosDisponiveis);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// REGISTRAR CONSULTA MÉDICA
app.post(["/consulta", "/api/consulta"], (req, res) => {
  try {
    const db = readDB();
    const { paciente, diagnostico, medicamentoId, obs } = req.body;

    if (!paciente || medicamentoId === undefined || medicamentoId === null || medicamentoId === "") {
      return res.status(400).json({
        erro: "Informe o paciente e selecione um medicamento do estoque."
      });
    }

    const medicamento = db.estoque.find(
      item => String(item.id) === String(medicamentoId)
    );
    if (!medicamento) {
      return res.status(404).json({ erro: "O medicamento selecionado não está cadastrado no estoque." });
    }

    const estoqueAtual = Number(medicamento.quantidade);
    if (!Number.isInteger(estoqueAtual) || estoqueAtual < 0) {
      return res.status(500).json({ erro: "A quantidade cadastrada para este medicamento é inválida." });
    }
    if (estoqueAtual < 1) {
      return res.status(409).json({ erro: `Estoque insuficiente para prescrever ${medicamento.nome}.` });
    }

    medicamento.quantidade = estoqueAtual - 1;
    const consulta = {
      id: Date.now(),
      paciente,
      diagnostico: diagnostico || "",
      medicacao: medicamento.nome,
      medicamentoId: medicamento.id,
      quantidadeDispensada: 1,
      unidade: medicamento.unidade || "unidades",
      estoqueRestante: medicamento.quantidade,
      obs: obs || "",
      createdAt: new Date().toISOString()
    };

    db.consultas.push(consulta);
    writeDB(db);

    return res.status(201).json({ sucesso: true, consulta });
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// LISTAR MEDICAÇÕES PRESCRITAS
app.get(["/medicacoes", "/api/medicacoes/prescritas"], (req, res) => {
  try {
    const db = readDB();
    return res.json(db.consultas);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// CHAMADA ATUAL DA TV E HISTÓRICO
app.get("/tv/chamada", (req, res) => {
  try {
    const db = readDB();

    return res.json({
      chamada: db.tv_chamada || null,
      historico: db.tv_historico || []
    });
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// CHAMAR PACIENTE NA TV
app.post("/tv/chamar", (req, res) => {
  try {
    const db = readDB();
    const { paciente, localTipo, localNumero } = req.body;

    if (!paciente) {
      return res.status(400).json({
        erro: "Informe o nome do paciente."
      });
    }

    const chamada = {
      id: Date.now(),
      paciente,
      localTipo: localTipo || "Consultório",
      localNumero: localNumero || "1",
      createdAt: new Date().toISOString()
    };

    db.tv_chamada = chamada;

    if (!Array.isArray(db.tv_historico)) {
      db.tv_historico = [];
    }

    db.tv_historico.unshift(chamada);
    db.tv_historico = db.tv_historico.slice(0, 20);

    writeDB(db);

    return res.status(201).json(chamada);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// REGISTRAR ALTA
app.post("/alta", (req, res) => {
  try {
    const db = readDB();
    const {
      paciente,
      tipoAlta,
      motivo,
      orientacoes,
      observacoes
    } = req.body;

    if (!paciente) {
      return res.status(400).json({
        erro: "Informe o paciente."
      });
    }

    const alta = {
      id: Date.now(),
      paciente,
      tipoAlta: tipoAlta || "Alta médica",
      motivo: motivo || "",
      orientacoes: orientacoes || "",
      observacoes: observacoes || "",
      createdAt: new Date().toISOString()
    };

    db.altas.push(alta);
    writeDB(db);

    return res.status(201).json(alta);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// LISTAR ALTAS
app.get("/altas", (req, res) => {
  try {
    const db = readDB();
    return res.json(db.altas);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// INTERNAR PACIENTE
app.post("/internacao", (req, res) => {
  try {
    const db = readDB();
    const { paciente, leito } = req.body;

    if (!paciente || !leito) {
      return res.status(400).json({
        erro: "Informe o paciente e o número do leito."
      });
    }

    const internacao = {
      id: Date.now(),
      paciente,
      leito,
      status: "internado",
      createdAt: new Date().toISOString()
    };

    db.internacoes.push(internacao);

    const pacienteDB = db.pacientes.find(
      p => String(p.nome).trim().toLowerCase() ===
        String(paciente).trim().toLowerCase()
    );

    if (pacienteDB) {
      pacienteDB.status = "internado";
      pacienteDB.leito = leito;
    }

    writeDB(db);

    return res.status(201).json(internacao);
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// LISTAR PACIENTES INTERNADOS
app.get("/internacao", (req, res) => {
  try {
    const db = readDB();
    return res.json(db.internacoes.filter(
      p => p.status === "internado"
    ));
  } catch (erro) {
    return responderErro(res, erro);
  }
});

// EXPORTAÇÃO PARA API / AMBIENTE SERVERLESS
module.exports = app;

// Execução local opcional:
// node api/index.js
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Hospital Santa Cecília rodando em http://localhost:${PORT}`);
  });
}
