let dados = { lancamentos: [], tipos: [], subtipos: [], categorias: [], contas: [] };
let charts = {};
let selConfig = { tipo: null, subtipo: null };
let deleteCallback = null;

async function init() {
  await carregarTudo();

  // Define mês atual no filtro
  const hoje = new Date();
  const inputMes = document.getElementById("filtro-mes");
  if(inputMes) {
      inputMes.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }

  await carregarSeletorAnos();
  atualizarInterface();
  carregarVencimentos();
}

async function carregarSeletorAnos() {
  try {
    const res = await fetch("/api/anos_disponiveis");
    const anos = await res.json();
    const select = document.getElementById("filtro-ano-plan");
    if (!select) return;

    const anoSelecionado = select.value || new Date().getFullYear().toString();
    select.innerHTML = "";
    anos.forEach((ano) => {
      const opt = document.createElement("option");
      opt.value = ano;
      opt.textContent = ano;
      if (ano.toString() === anoSelecionado) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) { console.error("Erro ao carregar anos:", e); }
}

async function carregarTudo() {
  try {
    // Agora buscamos também as CONTAS
    const [l, t, s, c, cont] = await Promise.all([
      fetch("/api/lancamentos").then((r) => r.json()),
      fetch("/api/config/tipos").then((r) => r.json()),
      fetch("/api/config/subtipos").then((r) => r.json()),
      fetch("/api/config/categorias").then((r) => r.json()),
      fetch("/api/config/contas").then((r) => r.json()) 
    ]);
    dados.lancamentos = l;
    dados.tipos = t;
    dados.subtipos = s;
    dados.categorias = c;
    dados.contas = cont; // Salva as contas na memória

    renderConfigLists();
    atualizarInterface();
    carregarSeletorAnos();
  } catch (e) {
    console.error(e);
  }
}

function renderConfigLists() {
  // 1. Renderiza TIPOS
  const divT = document.getElementById("lista-tipos");
  if(divT) {
      divT.innerHTML = "";
      dados.tipos.forEach(t =>
        (divT.innerHTML += `<a href="#" class="list-group-item list-group-item-action ${
          selConfig.tipo === t.id ? "active" : ""
        }" onclick="selectTipoConfig(${t.id}, event)"><span class="fw-bold">${t.nome}</span></a>`)
      );
  }

  // 2. Renderiza SUBTIPOS
  const divS = document.getElementById("lista-subtipos");
  if(divS) {
      divS.innerHTML = "";
      if (selConfig.tipo) {
        dados.subtipos.filter((s) => s.tipo_id === selConfig.tipo).forEach(s =>
            (divS.innerHTML += `<div class="list-group-item list-group-item-action ${
              selConfig.subtipo === s.id ? "active" : ""
            } d-flex justify-content-between align-items-center" onclick="selectSubtipoConfig(${s.id}, event)">
            <span>${s.nome}</span>
            <span class="btn-excluir" onclick="prepararExclusao(this, 'subtipos', ${s.id}, event)">🗑️</span></div>`)
        );
      } else {
        divS.innerHTML = '<span class="text-muted small p-2">Selecione um Tipo.</span>';
      }
  }

  // 3. Renderiza CATEGORIAS
  const divC = document.getElementById("lista-categorias");
  if(divC) {
      divC.innerHTML = "";
      if (selConfig.subtipo) {
        dados.categorias.filter((c) => c.subtipo_id === selConfig.subtipo).forEach(c =>
            (divC.innerHTML += `<div class="list-group-item d-flex justify-content-between align-items-center">
            <span>${c.nome}</span>
            <span class="btn-excluir" onclick="prepararExclusao(this, 'categorias', ${c.id}, event)">🗑️</span></div>`)
        );
      } else {
        divC.innerHTML = '<span class="text-muted small p-2">Selecione um Subtipo.</span>';
      }
  }

  // 4. Renderiza CONTAS (NOVO)
  const divContas = document.getElementById("lista-contas");
  if(divContas) {
      divContas.innerHTML = "";
      dados.contas.forEach(c => {
          // Define um ícone baseado no tipo
          let icone = "💰";
          if(c.tipo === 'cartao_credito') icone = "💳";
          if(c.tipo === 'investimento') icone = "📈";
          if(c.tipo === 'vale') icone = "🍽️";
          if(c.tipo === 'carteira') icone = "💵";
          
          divContas.innerHTML += `<div class="list-group-item d-flex justify-content-between align-items-center">
              <span>${icone} <strong>${c.nome}</strong> <small class="text-muted">(${fmtTipoConta(c.tipo)})</small></span>
              <span class="btn-excluir" onclick="prepararExclusao(this, 'contas', ${c.id}, event)">🗑️</span>
          </div>`;
      });
  }

  // Atualiza labels de seleção
  const tSel = dados.tipos.find((t) => t.id === selConfig.tipo);
  const sSel = dados.subtipos.find((s) => s.id === selConfig.subtipo);
  const lblT = document.getElementById("lbl-tipo-selecionado");
  const lblS = document.getElementById("lbl-subtipo-selecionado");
  if(lblT) lblT.textContent = tSel ? tSel.nome : "---";
  if(lblS) lblS.textContent = sSel ? sSel.nome : "---";
}

function fmtTipoConta(tipo) {
    const mapa = {
        'banco': 'Conta',
        'cartao_credito': 'Crédito',
        'vale': 'Vale',
        'investimento': 'Inv.',
        'carteira': 'Físico'
    };
    return mapa[tipo] || tipo;
}

// LÓGICA DE SELEÇÃO E EXCLUSÃO
function selectTipoConfig(id, e) {
  if (e) e.preventDefault();
  selConfig.tipo = id;
  selConfig.subtipo = null;
  renderConfigLists();
}
function selectSubtipoConfig(id, e) {
  if (e) e.preventDefault();
  selConfig.subtipo = id;
  renderConfigLists();
}
function prepararExclusao(el, endpoint, id, event) {
  event.stopPropagation();
  el.outerHTML = `<span onclick="event.stopPropagation()">
    <span class="text-danger fw-bold small me-2">Apagar?</span>
    <button class="btn btn-sm btn-danger py-0 px-2" onclick="confirmarExclusao('${endpoint}', ${id})">Sim</button>
    <button class="btn btn-sm btn-secondary py-0 px-2" onclick="renderConfigLists()">Não</button>
  </span>`;
}
async function confirmarExclusao(endpoint, id) {
  await fetch(`/api/config/${endpoint}?id=${id}`, { method: "DELETE" });
  carregarTudo();
}

// SUBMISSÃO DOS FORMULÁRIOS DE CONFIGURAÇÃO
const formSubtipo = document.getElementById("form-subtipo");
if(formSubtipo) {
    formSubtipo.onsubmit = async (e) => {
      e.preventDefault();
      if (!selConfig.tipo) return alert("Selecione Tipo.");
      await fetch("/api/config/subtipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: document.getElementById("novo-subtipo-nome").value,
          tipo_id: selConfig.tipo,
        }),
      });
      document.getElementById("novo-subtipo-nome").value = "";
      carregarTudo();
    };
}

const formCategoria = document.getElementById("form-categoria");
if(formCategoria) {
    formCategoria.onsubmit = async (e) => {
      e.preventDefault();
      if (!selConfig.subtipo) return alert("Selecione Subtipo.");
      await fetch("/api/config/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: document.getElementById("novo-categoria-nome").value,
          subtipo_id: selConfig.subtipo,
        }),
      });
      document.getElementById("novo-categoria-nome").value = "";
      carregarTudo();
    };
}

// --- LÓGICA PARA ADICIONAR CONTA (NOVO) ---
const formConta = document.getElementById("form-conta");
if(formConta) {
    formConta.onsubmit = async (e) => {
      e.preventDefault();
      await fetch("/api/config/contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: document.getElementById("nova-conta-nome").value,
          tipo: document.getElementById("nova-conta-tipo").value,
        }),
      });
      document.getElementById("nova-conta-nome").value = "";
      carregarTudo();
    };
}

// PREPARA O MODAL DE LANÇAMENTO (Preenche selects)
window.prepararModal = () => {
  const inpData = document.getElementById("inp-data");
  if(inpData) inpData.value = new Date().toISOString().split("T")[0];
  
  const formLanc = document.getElementById("form-lancamento");
  if(formLanc) formLanc.reset();

  // PREENCHE SELECT DE CONTAS (NOVO)
  const selConta = document.getElementById("input-conta");
  if(selConta) {
      selConta.innerHTML = "";
      dados.contas.forEach(c => {
          selConta.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
      });
  }

  carregarTiposNoModal();
};

function carregarTiposNoModal() {
  const sel = document.getElementById("inp-tipo");
  if(!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>';
  dados.tipos.forEach(t => (sel.innerHTML += `<option value="${t.id}">${t.nome}</option>`));
  
  const selSub = document.getElementById("inp-subtipo");
  const selCat = document.getElementById("inp-categoria");
  if(selSub) selSub.innerHTML = "";
  if(selCat) selCat.innerHTML = "";
}

window.carregarSubtiposNoModal = () => {
  const tid = parseInt(document.getElementById("inp-tipo").value);
  const sel = document.getElementById("inp-subtipo");
  if(!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>';
  if (tid)
    dados.subtipos.filter((s) => s.tipo_id === tid).forEach(s => 
        (sel.innerHTML += `<option value="${s.id}">${s.nome}</option>`)
    );
  
  const selCat = document.getElementById("inp-categoria");
  if(selCat) selCat.innerHTML = "";
};

window.carregarCategoriasNoModal = () => {
  const sid = parseInt(document.getElementById("inp-subtipo").value);
  const sel = document.getElementById("inp-categoria");
  if(!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>';
  if (sid)
    dados.categorias.filter((c) => c.subtipo_id === sid).forEach(c => 
        (sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`)
    );
};

// SALVAR LANÇAMENTO
const formLanc = document.getElementById("form-lancamento");
if(formLanc) {
    formLanc.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.append("data", document.getElementById("inp-data").value);
      fd.append("descricao", document.getElementById("inp-desc").value);
      fd.append("valor", document.getElementById("inp-valor").value);
      fd.append("tipo_id", document.getElementById("inp-tipo").value);
      fd.append("subtipo_id", document.getElementById("inp-subtipo").value);
      
      const catVal = document.getElementById("inp-categoria").value;
      fd.append("categoria_id", catVal);

      // ENVIA A CONTA SELECIONADA (NOVO)
      const contaVal = document.getElementById("input-conta").value;
      fd.append("conta_id", contaVal);

      const arq = document.getElementById("inp-arquivo");
      if (arq && arq.files.length) fd.append("arquivo", arq.files[0]);
      
      if ((await fetch("/api/lancamentos", { method: "POST", body: fd })).ok) {
        bootstrap.Modal.getInstance(document.getElementById("modalLancamento")).hide();
        carregarTudo();
      } else {
          alert("Erro ao salvar.");
      }
    };
}

// ATUALIZA A TABELA E GRÁFICOS
function atualizarInterface() {
  const filtroMes = document.getElementById("filtro-mes");
  if(!filtroMes) return;
  
  const mes = filtroMes.value;
  const lista = dados.lancamentos.filter((l) => l.data.startsWith(mes));
  const tbody = document.getElementById("tabela-lancamentos-body");
  
  if(tbody) {
      tbody.innerHTML = "";
      let tot = { entOk: 0, entPen: 0, saiOk: 0, saiPen: 0 };
      
      lista.sort((a, b) => new Date(b.data) - new Date(a.data));
      
      lista.forEach((l) => {
        if (l.tipo === "Entrada") {
          if (l.efetivado) tot.entOk += l.valor; else tot.entPen += l.valor;
        } else {
          if (l.efetivado) tot.saiOk += l.valor; else tot.saiPen += l.valor;
        }
        
        const cor = l.tipo === "Entrada" ? "text-success" : "text-danger";
        const anexoHtml = l.comprovante
          ? `<a href="/uploads/${l.comprovante}" target="_blank" class="text-decoration-none ms-2" title="Abrir Anexo">📎</a>`
          : "";
        
        // --- ADICIONADO CAMPO DA CONTA NA TABELA ---
        tbody.innerHTML += `<tr>
            <td><input type="checkbox" onchange="toggleStatus(${l.id})" ${l.efetivado ? "checked" : ""}></td>
            <td>${l.data.split("-").reverse().join("/")}</td>
            <td><span class="badge bg-light text-dark border">${l.conta || '-'}</span></td>
            <td>${l.descricao} ${anexoHtml}</td>
            <td>${l.tipo}</td>
            <td>${l.subtipo}</td>
            <td>${l.categoria}</td>
            <td class="${cor}">${fmtMoeda(l.valor)}</td>
            <td><button class="btn btn-sm btn-outline-danger border-0" onclick="delLanc(${l.id})">🗑️</button></td>
        </tr>`;
      });

      // Atualiza Cards
      const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = fmtMoeda(val); };
      setTxt("card-ent-ok", tot.entOk);
      setTxt("card-ent-pend", tot.entPen);
      setTxt("card-sai-ok", tot.saiOk);
      setTxt("card-sai-pend", tot.saiPen);
      setTxt("card-saldo", tot.entOk - tot.saiOk);

      drawChartBalanco(tot.entOk, tot.saiOk);
      
      const ef = lista.filter((l) => l.efetivado);
      drawChart("chartEntSub", ef, "Entrada", "subtipo");
      drawChart("chartEntCat", ef, "Entrada", "categoria");
      drawChart("chartSaiSub", ef, "Saída", "subtipo");
      drawChart("chartSaiCat", ef, "Saída", "categoria");
  }
}

// ... (RESTANTE DAS FUNÇÕES DE GRÁFICO E VENCIMENTO PERMANECEM IGUAIS)
// Vou omitir as funções drawChartBalanco, drawChart, toggleStatus, delLanc, carregarVencimentos, etc. 
// pois elas não mudam a lógica, apenas a renderização dos dados já filtrados.
// Mas para garantir que não quebre nada ao copiar e colar, vou colocar as funções essenciais de volta abaixo.

function drawChartBalanco(e, s) {
  const ctx = document.getElementById("chartBalanco");
  if (!ctx) return;
  if (charts["chartBalanco"]) charts["chartBalanco"].destroy();
  charts["chartBalanco"] = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Entradas", "Saídas"],
      datasets: [{ data: [e, s], backgroundColor: ["#198754", "#dc3545"] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function drawChart(id, d, f, c) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const i = d.filter((l) => l.tipo === f);
  const g = {};
  i.forEach((x) => { const k = x[c] || "Outros"; g[k] = (g[k] || 0) + x.valor; });
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(g),
      datasets: [{ data: Object.values(g), backgroundColor: ["#0d6efd", "#6610f2", "#d63384", "#dc3545", "#ffc107", "#198754", "#20c997", "#0dcaf0"] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

async function toggleStatus(id) {
  await fetch(`/api/lancamentos/${id}/status`, { method: "PATCH" });
  carregarTudo();
}
async function delLanc(id) {
  showConfirmDelete(async () => {
    await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
    carregarTudo();
  });
}

// VENCIMENTOS
async function carregarVencimentos() {
  try {
    const l = await fetch("/api/vencimentos").then((r) => r.json());
    const tb = document.getElementById("tabela-vencimentos-body");
    if(tb) {
        tb.innerHTML = "";
        l.forEach((v) => {
          const sw = `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" onchange="toggleVencimento(${v.id})" ${v.ativo ? "checked" : ""}></div>`;
          const dt = v.tipo === "fixo" ? `Todo dia ${v.dia}` : (v.data_vencimento ? v.data_vencimento.split("-").reverse().join("/") : "-");
          tb.innerHTML += `<tr><td>${v.descricao}</td><td>${v.tipo}</td><td>${dt}</td><td>${sw}</td><td><button class="btn btn-sm btn-outline-danger border-0" onclick="delVenc(${v.id})">🗑️</button></td></tr>`;
        });
    }
  } catch (e) { console.error(e); }
}
async function toggleVencimento(id) {
  await fetch(`/api/vencimentos/${id}/toggle`, { method: "PATCH" });
  carregarVencimentos();
}
async function delVenc(id) {
  showConfirmDelete(async () => {
    await fetch(`/api/vencimentos/${id}`, { method: "DELETE" });
    carregarVencimentos();
  });
}

const fV = document.getElementById("form-vencimento");
if (fV)
  fV.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = {
      descricao: document.getElementById("venc-descricao").value,
      tipo: document.getElementById("venc-tipo").value,
      dia: document.getElementById("venc-tipo").value === "fixo" ? parseInt(document.getElementById("venc-dia").value) : null,
      data_vencimento: document.getElementById("venc-tipo").value === "variavel" ? document.getElementById("venc-data").value : null,
    };
    if ((await fetch("/api/vencimentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })).ok) {
      fV.reset();
      bootstrap.Modal.getInstance(document.getElementById("modalVencimento")).hide();
      carregarVencimentos();
    }
  });

window.alternarCamposVencimento = () => {
  const t = document.getElementById("venc-tipo").value;
  document.getElementById("div-dia-fixo").classList.toggle("d-none", t !== "fixo");
  document.getElementById("div-data-variavel").classList.toggle("d-none", t !== "variavel");
};

// PLANEJAMENTO
async function carregarPlanejamento() {
  const elAno = document.getElementById("filtro-ano-plan");
  const ano = elAno ? elAno.value : new Date().getFullYear();
  const res = await fetch(`/api/planejamento?ano=${ano}`);
  const plan = await res.json();
  const tbody = document.getElementById("tbody-planejamento");
  if(!tbody) return;
  tbody.innerHTML = "";

  const desenharSecao = (nomeTipo, corHeader) => {
    if (!plan[nomeTipo]) return;
    tbody.innerHTML += `<tr class="table-${corHeader}"><td colspan="14" class="fw-bold text-start text-uppercase">${nomeTipo}</td></tr>`;
    for (const [subtipo, categorias] of Object.entries(plan[nomeTipo])) {
      tbody.innerHTML += `<tr><td colspan="14" class="fw-bold text-start bg-light ps-4 text-muted small">${subtipo.toUpperCase()}</td></tr>`;
      for (const [cat, valores] of Object.entries(categorias)) {
        let linhaHtml = `<td class="text-start ps-5">${cat}</td>`;
        let totalCat = 0;
        valores.forEach((v) => { linhaHtml += `<td>${v > 0 ? fmtMoedaSimples(v) : "-"}</td>`; totalCat += v; });
        linhaHtml += `<td class="fw-bold bg-light">${fmtMoedaSimples(totalCat)}</td>`;
        tbody.innerHTML += `<tr>${linhaHtml}</tr>`;
      }
    }
  };
  desenharSecao("Entrada", "success");
  desenharSecao("Saída", "danger");
}

// HELPERS
function showConfirmDelete(callback) {
  deleteCallback = callback;
  const el = document.getElementById("modalConfirmDelete");
  if(el) new bootstrap.Modal(el).show();
}
const btnConfDel = document.getElementById("btn-confirm-delete");
if(btnConfDel) btnConfDel.onclick = () => {
  if (deleteCallback) deleteCallback();
  bootstrap.Modal.getInstance(document.getElementById("modalConfirmDelete")).hide();
};

window.fmtMoeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function fmtMoedaSimples(v) { return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

window.atualizarInterface = atualizarInterface;
window.toggleVencimento = toggleVencimento;
window.carregarPlanejamento = carregarPlanejamento;
window.carregarSeletorAnos = carregarSeletorAnos;
window.delLanc = delLanc;
window.delVenc = delVenc;
window.selectTipoConfig = selectTipoConfig;
window.selectSubtipoConfig = selectSubtipoConfig;
window.prepararExclusao = prepararExclusao;
window.confirmarExclusao = confirmarExclusao;

init();