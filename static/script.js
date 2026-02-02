/* static/script.js */
let dados = { lancamentos: [], tipos: [], subtipos: [], categorias: [], contas: [] };
let charts = {};
let selConfig = { tipo: null, subtipo: null };
let deleteCallback = null;

async function init() {
  await carregarTudo();

  const hoje = new Date();
  const inputMes = document.getElementById("filtro-mes");
  if(inputMes && !inputMes.value) {
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
      opt.value = ano; opt.textContent = ano;
      if (ano.toString() === anoSelecionado) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) { console.error("Erro ao carregar anos:", e); }
}

async function carregarTudo() {
  try {
    const [l, t, s, c, cont] = await Promise.all([
      fetch("/api/lancamentos").then((r) => r.json()),
      fetch("/api/config/tipos").then((r) => r.json()),
      fetch("/api/config/subtipos").then((r) => r.json()),
      fetch("/api/config/categorias").then((r) => r.json()),
      fetch("/api/config/contas").then((r) => r.json()) 
    ]);
    dados.lancamentos = l; dados.tipos = t; dados.subtipos = s; dados.categorias = c; dados.contas = cont;

    renderConfigLists();
    renderContaSelector();
    atualizarInterface();
    carregarSeletorAnos();
  } catch (e) { console.error(e); }
}

function renderContaSelector() {
    const sel = document.getElementById("filtro-conta");
    if(!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Todas as Contas</option>';
    dados.contas.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`; });
    sel.value = valorAtual;
}

function renderConfigLists() {
  const divT = document.getElementById("lista-tipos");
  if(divT) {
      divT.innerHTML = "";
      dados.tipos.forEach(t => (divT.innerHTML += `<a href="#" class="list-group-item list-group-item-action ${selConfig.tipo === t.id ? "active" : ""}" onclick="selectTipoConfig(${t.id}, event)"><span class="fw-bold">${t.nome}</span></a>`));
  }
  const divS = document.getElementById("lista-subtipos");
  if(divS) {
      divS.innerHTML = "";
      if (selConfig.tipo) {
        dados.subtipos.filter((s) => s.tipo_id === selConfig.tipo).forEach(s => (divS.innerHTML += `<div class="list-group-item list-group-item-action ${selConfig.subtipo === s.id ? "active" : ""} d-flex justify-content-between align-items-center" onclick="selectSubtipoConfig(${s.id}, event)"><span>${s.nome}</span><span class="btn-excluir" onclick="prepararExclusao(this, 'subtipos', ${s.id}, event)">🗑️</span></div>`));
      } else { divS.innerHTML = '<span class="text-muted small p-2">Selecione um Tipo.</span>'; }
  }
  const divC = document.getElementById("lista-categorias");
  if(divC) {
      divC.innerHTML = "";
      if (selConfig.subtipo) {
        dados.categorias.filter((c) => c.subtipo_id === selConfig.subtipo).forEach(c => (divC.innerHTML += `<div class="list-group-item d-flex justify-content-between align-items-center"><span>${c.nome}</span><span class="btn-excluir" onclick="prepararExclusao(this, 'categorias', ${c.id}, event)">🗑️</span></div>`));
      } else { divC.innerHTML = '<span class="text-muted small p-2">Selecione um Subtipo.</span>'; }
  }
  const divContas = document.getElementById("lista-contas");
  if(divContas) {
      divContas.innerHTML = "";
      dados.contas.forEach(c => {
          let icone = "💰";
          if(c.tipo === 'cartao_credito') icone = "💳"; if(c.tipo === 'investimento') icone = "📈"; if(c.tipo === 'vale') icone = "🍽️"; if(c.tipo === 'carteira') icone = "💵";
          divContas.innerHTML += `<div class="list-group-item d-flex justify-content-between align-items-center"><span>${icone} <strong>${c.nome}</strong> <small class="text-muted">(${fmtTipoConta(c.tipo)})</small></span><span class="btn-excluir" onclick="prepararExclusao(this, 'contas', ${c.id}, event)">🗑️</span></div>`;
      });
  }
  const tSel = dados.tipos.find((t) => t.id === selConfig.tipo); const sSel = dados.subtipos.find((s) => s.id === selConfig.subtipo);
  const lblT = document.getElementById("lbl-tipo-selecionado"); const lblS = document.getElementById("lbl-subtipo-selecionado");
  if(lblT) lblT.textContent = tSel ? tSel.nome : "---"; if(lblS) lblS.textContent = sSel ? sSel.nome : "---";
}

function fmtTipoConta(tipo) { const mapa = { 'banco': 'Conta', 'cartao_credito': 'Crédito', 'vale': 'Vale', 'investimento': 'Inv.', 'carteira': 'Físico' }; return mapa[tipo] || tipo; }
function selectTipoConfig(id, e) { if (e) e.preventDefault(); selConfig.tipo = id; selConfig.subtipo = null; renderConfigLists(); }
function selectSubtipoConfig(id, e) { if (e) e.preventDefault(); selConfig.subtipo = id; renderConfigLists(); }
function prepararExclusao(el, endpoint, id, event) { event.stopPropagation(); el.outerHTML = `<span onclick="event.stopPropagation()"><span class="text-danger fw-bold small me-2">Apagar?</span><button class="btn btn-sm btn-danger py-0 px-2" onclick="confirmarExclusao('${endpoint}', ${id})">Sim</button><button class="btn btn-sm btn-secondary py-0 px-2" onclick="renderConfigLists()">Não</button></span>`; }
async function confirmarExclusao(endpoint, id) { await fetch(`/api/config/${endpoint}?id=${id}`, { method: "DELETE" }); carregarTudo(); }

const formSubtipo = document.getElementById("form-subtipo");
if(formSubtipo) { formSubtipo.onsubmit = async (e) => { e.preventDefault(); if (!selConfig.tipo) return alert("Selecione Tipo."); await fetch("/api/config/subtipos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: document.getElementById("novo-subtipo-nome").value, tipo_id: selConfig.tipo }), }); document.getElementById("novo-subtipo-nome").value = ""; carregarTudo(); }; }
const formCategoria = document.getElementById("form-categoria");
if(formCategoria) { formCategoria.onsubmit = async (e) => { e.preventDefault(); if (!selConfig.subtipo) return alert("Selecione Subtipo."); await fetch("/api/config/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: document.getElementById("novo-categoria-nome").value, subtipo_id: selConfig.subtipo }), }); document.getElementById("novo-categoria-nome").value = ""; carregarTudo(); }; }
const formConta = document.getElementById("form-conta");
if(formConta) { formConta.onsubmit = async (e) => { e.preventDefault(); await fetch("/api/config/contas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: document.getElementById("nova-conta-nome").value, tipo: document.getElementById("nova-conta-tipo").value }), }); document.getElementById("nova-conta-nome").value = ""; carregarTudo(); }; }

window.prepararModal = () => {
  const inpData = document.getElementById("input-data"); if(inpData) inpData.value = new Date().toISOString().split("T")[0];
  const formLanc = document.getElementById("form-lancamento"); if(formLanc) formLanc.reset();
  const inpParcelas = document.getElementById("input-parcelas"); if(inpParcelas) inpParcelas.value = "1";
  
  const selConta = document.getElementById("input-conta");
  if(selConta) { selConta.innerHTML = ""; dados.contas.forEach(c => { selConta.innerHTML += `<option value="${c.id}">${c.nome}</option>`; }); }
  carregarTiposNoModal();
};

function carregarTiposNoModal() {
  const sel = document.getElementById("input-tipo"); if(!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>'; dados.tipos.forEach(t => (sel.innerHTML += `<option value="${t.id}">${t.nome}</option>`));
  const selSub = document.getElementById("input-subtipo"); const selCat = document.getElementById("input-categoria"); if(selSub) selSub.innerHTML = ""; if(selCat) selCat.innerHTML = "";
}

window.atualizarOpcoesFormulario = () => {
  const tid = parseInt(document.getElementById("input-tipo").value); const sel = document.getElementById("input-subtipo"); if(!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>'; if (tid) dados.subtipos.filter((s) => s.tipo_id === tid).forEach(s => (sel.innerHTML += `<option value="${s.id}">${s.nome}</option>`));
  const selCat = document.getElementById("input-categoria"); if(selCat) selCat.innerHTML = "";
};
window.filtrarCategoriasNoLancamento = () => {
  const sid = parseInt(document.getElementById("input-subtipo").value); const sel = document.getElementById("input-categoria"); if(!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>'; if (sid) dados.categorias.filter((c) => c.subtipo_id === sid).forEach(c => (sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`));
};

const formLanc = document.getElementById("form-lancamento");
if(formLanc) {
    formLanc.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.append("data", document.getElementById("input-data").value); fd.append("descricao", document.getElementById("input-descricao").value); fd.append("valor", document.getElementById("input-valor").value);
      fd.append("tipo_id", document.getElementById("input-tipo").value); fd.append("subtipo_id", document.getElementById("input-subtipo").value); fd.append("categoria_id", document.getElementById("input-categoria").value); fd.append("conta_id", document.getElementById("input-conta").value);
      fd.append("parcelas", document.getElementById("input-parcelas") ? document.getElementById("input-parcelas").value : "1");
      const arq = document.getElementById("input-arquivo"); if (arq && arq.files.length) fd.append("arquivo", arq.files[0]);
      if ((await fetch("/api/lancamentos", { method: "POST", body: fd })).ok) { bootstrap.Modal.getInstance(document.getElementById("modalLancamento")).hide(); carregarTudo(); } else { alert("Erro ao salvar."); }
    };
}

// LÓGICA DE PAGAMENTO DE FATURA (CORRIGIDA)
window.abrirModalPagamento = () => {
    const modal = new bootstrap.Modal(document.getElementById("modalPagamentoFatura"));
    document.getElementById("pag-data").value = new Date().toISOString().split("T")[0];

    const selCartao = document.getElementById("pag-cartao-destino");
    selCartao.innerHTML = "";
    dados.contas.filter(c => c.tipo === 'cartao_credito').forEach(c => {
        selCartao.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });

    const selOrigem = document.getElementById("pag-conta-origem");
    selOrigem.innerHTML = "";
    dados.contas.filter(c => c.tipo !== 'cartao_credito').forEach(c => {
        selOrigem.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });

    modal.show();
};

const formPag = document.getElementById("form-pagar-fatura");
if(formPag) {
    formPag.onsubmit = async (e) => {
        e.preventDefault();
        
        const dataPag = document.getElementById("pag-data").value;
        const valor = document.getElementById("pag-valor").value;
        const cartaoId = document.getElementById("pag-cartao-destino").value;
        const origemId = document.getElementById("pag-conta-origem").value;
        
        const nomeCartao = dados.contas.find(c => c.id == cartaoId).nome;
        const nomeOrigem = dados.contas.find(c => c.id == origemId).nome;

        const idTipoEntrada = 1; // ID fixo para Entrada
        const idTipoSaida = 2;   // ID fixo para Saída

        // --- LÓGICA INTELIGENTE DE CATEGORIZAÇÃO ---
        // Tenta achar subtipo "Transferências" ou pega o primeiro disponível
        const findSub = (tid, nome) => dados.subtipos.find(s => s.tipo_id == tid && s.nome.toLowerCase().includes(nome.toLowerCase()))?.id || dados.subtipos.find(s => s.tipo_id == tid)?.id;
        
        // Tenta achar categoria "Pagamento Fatura" ou pega a primeira disponível do subtipo escolhido
        const findCat = (sid, nome) => dados.categorias.find(c => c.subtipo_id == sid && c.nome.toLowerCase().includes(nome.toLowerCase()))?.id || dados.categorias.find(c => c.subtipo_id == sid)?.id;

        const subSaidaId = findSub(idTipoSaida, "Transferência");
        const catSaidaId = findCat(subSaidaId, "Pagamento Fatura");

        const subEntradaId = findSub(idTipoEntrada, "Transferência");
        const catEntradaId = findCat(subEntradaId, "Pagamento Fatura");
        // -------------------------------------------

        // 1. SAÍDA DA CONTA (PAGAMENTO)
        const fd1 = new FormData();
        fd1.append("data", dataPag);
        fd1.append("descricao", `Pagamento Fatura ${nomeCartao}`);
        fd1.append("valor", valor);
        fd1.append("tipo_id", idTipoSaida);
        fd1.append("subtipo_id", subSaidaId);
        fd1.append("categoria_id", catSaidaId);
        fd1.append("conta_id", origemId);
        
        // 2. ENTRADA NO CARTÃO (ABATIMENTO)
        const fd2 = new FormData();
        fd2.append("data", dataPag);
        fd2.append("descricao", `Pagamento Recebido (de ${nomeOrigem})`);
        fd2.append("valor", valor);
        fd2.append("tipo_id", idTipoEntrada);
        fd2.append("subtipo_id", subEntradaId);
        fd2.append("categoria_id", catEntradaId);
        fd2.append("conta_id", cartaoId);

        await Promise.all([
            fetch("/api/lancamentos", { method: "POST", body: fd1 }),
            fetch("/api/lancamentos", { method: "POST", body: fd2 })
        ]);

        bootstrap.Modal.getInstance(document.getElementById("modalPagamentoFatura")).hide();
        formPag.reset();
        carregarTudo();
        alert("Pagamento registrado com sucesso! ✅");
    };
}

// ATUALIZA INTERFACE
function atualizarInterface() {
  const filtroMes = document.getElementById("filtro-mes"); const filtroConta = document.getElementById("filtro-conta"); if(!filtroMes) return;
  const mes = filtroMes.value; const contaId = filtroConta ? filtroConta.value : ""; 
  const lista = dados.lancamentos.filter((l) => { const mesmoMes = l.data.startsWith(mes); const mesmaConta = contaId === "" || String(l.conta_id) === contaId; return mesmoMes && mesmaConta; });
  const tbody = document.getElementById("tabela-lancamentos-body");
  if(tbody) {
      tbody.innerHTML = "";
      let totalEntradas = 0; let totalSaidas = 0; let saldoDisponivel = 0; let faturaCartao = 0;
      lista.sort((a, b) => new Date(b.data) - new Date(a.data));
      lista.forEach((l) => {
        const conta = dados.contas.find(c => c.id === l.conta_id); const ehCredito = conta && conta.tipo === 'cartao_credito';
        if (l.efetivado) {
            if (l.tipo === "Entrada") totalEntradas += l.valor; else totalSaidas += l.valor;
            if (ehCredito) { if (l.tipo === 'Saída') faturaCartao += l.valor; else faturaCartao -= l.valor; } 
            else { if (l.tipo === 'Entrada') saldoDisponivel += l.valor; else saldoDisponivel -= l.valor; }
        }
        const cor = l.tipo === "Entrada" ? "text-success" : "text-danger"; const anexoHtml = l.comprovante ? `<a href="/uploads/${l.comprovante}" target="_blank" class="text-decoration-none ms-2" title="Abrir Anexo">📎</a>` : ""; let iconConta = ehCredito ? '💳' : '🏦';
        tbody.innerHTML += `<tr><td><input type="checkbox" onchange="toggleStatus(${l.id})" ${l.efetivado ? "checked" : ""}></td><td>${l.data.split("-").reverse().join("/")}</td><td><span class="badge bg-light text-dark border">${iconConta} ${l.conta || 'Geral'}</span></td><td>${l.descricao} ${anexoHtml}</td><td>${l.tipo}</td><td>${l.subtipo}</td><td>${l.categoria}</td><td class="${cor}">${fmtMoeda(l.valor)}</td><td><button class="btn btn-sm btn-outline-danger border-0" onclick="delLanc(${l.id})">🗑️</button></td></tr>`;
      });
      const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = fmtMoeda(val); };
      setTxt("card-saldo-disp", saldoDisponivel); setTxt("card-fatura", faturaCartao); setTxt("card-ent-geral", totalEntradas); setTxt("card-sai-geral", totalSaidas); setTxt("card-saldo-final", saldoDisponivel - faturaCartao);
      
      // Gráficos
      drawChartBalanco(totalEntradas, totalSaidas); 
      const ef = lista.filter((l) => l.efetivado); 
      drawChart("chartEntSub", ef, "Entrada", "subtipo"); 
      drawChart("chartEntCat", ef, "Entrada", "categoria"); 
      drawChart("chartSaiSub", ef, "Saída", "subtipo"); 
      drawChart("chartSaiCat", ef, "Saída", "categoria");
  }
}

// Configuração Comum para Tooltips de Moeda nos Gráficos
const chartOptionsMoeda = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { position: "bottom" },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.label || '';
                    if (label) { label += ': '; }
                    if (context.parsed !== null) {
                        label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                    }
                    return label;
                }
            }
        }
    }
};

function drawChartBalanco(e, s) { 
    const ctx = document.getElementById("chartBalanco"); 
    if (!ctx) return; 
    if (charts["chartBalanco"]) charts["chartBalanco"].destroy(); 
    charts["chartBalanco"] = new Chart(ctx, { 
        type: "pie", 
        data: { 
            labels: ["Entradas", "Saídas"], 
            datasets: [{ data: [e, s], backgroundColor: ["#198754", "#dc3545"] }] 
        }, 
        options: chartOptionsMoeda // Usa a opção com formatador
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
            datasets: [{ 
                data: Object.values(g), 
                backgroundColor: ["#0d6efd", "#6610f2", "#d63384", "#dc3545", "#ffc107", "#198754", "#20c997", "#0dcaf0"] 
            }] 
        }, 
        options: chartOptionsMoeda // Usa a opção com formatador
    }); 
}

async function toggleStatus(id) { await fetch(`/api/lancamentos/${id}/status`, { method: "PATCH" }); carregarTudo(); }
async function delLanc(id) { showConfirmDelete(async () => { await fetch(`/api/lancamentos/${id}`, { method: "DELETE" }); carregarTudo(); }); }
async function carregarVencimentos() { try { const l = await fetch("/api/vencimentos").then((r) => r.json()); const tb = document.getElementById("tabela-vencimentos-body"); if(tb) { tb.innerHTML = ""; l.forEach((v) => { const sw = `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" onchange="toggleVencimento(${v.id})" ${v.ativo ? "checked" : ""}></div>`; const dt = v.tipo === "fixo" ? `Todo dia ${v.dia}` : (v.data_vencimento ? v.data_vencimento.split("-").reverse().join("/") : "-"); tb.innerHTML += `<tr><td>${v.descricao}</td><td>${v.tipo}</td><td>${dt}</td><td>${sw}</td><td><button class="btn btn-sm btn-outline-danger border-0" onclick="delVenc(${v.id})">🗑️</button></td></tr>`; }); } } catch (e) { console.error(e); } }
async function toggleVencimento(id) { await fetch(`/api/vencimentos/${id}/toggle`, { method: "PATCH" }); carregarVencimentos(); }
async function delVenc(id) { showConfirmDelete(async () => { await fetch(`/api/vencimentos/${id}`, { method: "DELETE" }); carregarVencimentos(); }); }
const fV = document.getElementById("form-vencimento"); if (fV) fV.addEventListener("submit", async (e) => { e.preventDefault(); const d = { descricao: document.getElementById("venc-descricao").value, tipo: document.getElementById("venc-tipo").value, dia: document.getElementById("venc-tipo").value === "fixo" ? parseInt(document.getElementById("venc-dia").value) : null, data_vencimento: document.getElementById("venc-tipo").value === "variavel" ? document.getElementById("venc-data").value : null, }; if ((await fetch("/api/vencimentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })).ok) { fV.reset(); bootstrap.Modal.getInstance(document.getElementById("modalVencimento")).hide(); carregarVencimentos(); } });
window.alternarCamposVencimento = () => { const t = document.getElementById("venc-tipo").value; document.getElementById("div-dia-fixo").classList.toggle("d-none", t !== "fixo"); document.getElementById("div-data-variavel").classList.toggle("d-none", t !== "variavel"); };
async function carregarPlanejamento() { const elAno = document.getElementById("filtro-ano-plan"); const ano = elAno ? elAno.value : new Date().getFullYear(); const res = await fetch(`/api/planejamento?ano=${ano}`); const plan = await res.json(); const tbody = document.getElementById("tbody-planejamento"); if(!tbody) return; tbody.innerHTML = ""; const desenharSecao = (nomeTipo, corHeader) => { if (!plan[nomeTipo]) return; tbody.innerHTML += `<tr class="table-${corHeader}"><td colspan="14" class="fw-bold text-start text-uppercase">${nomeTipo}</td></tr>`; for (const [subtipo, categorias] of Object.entries(plan[nomeTipo])) { tbody.innerHTML += `<tr><td colspan="14" class="fw-bold text-start bg-light ps-4 text-muted small">${subtipo.toUpperCase()}</td></tr>`; for (const [cat, valores] of Object.entries(categorias)) { let linhaHtml = `<td class="text-start ps-5">${cat}</td>`; let totalCat = 0; valores.forEach((v) => { linhaHtml += `<td>${v > 0 ? fmtMoedaSimples(v) : "-"}</td>`; totalCat += v; }); linhaHtml += `<td class="fw-bold bg-light">${fmtMoedaSimples(totalCat)}</td>`; tbody.innerHTML += `<tr>${linhaHtml}</tr>`; } } }; desenharSecao("Entrada", "success"); desenharSecao("Saída", "danger"); }
function showConfirmDelete(callback) { deleteCallback = callback; const el = document.getElementById("modalConfirmDelete"); if(el) new bootstrap.Modal(el).show(); }
const btnConfDel = document.getElementById("btn-confirm-delete"); if(btnConfDel) btnConfDel.onclick = () => { if (deleteCallback) deleteCallback(); bootstrap.Modal.getInstance(document.getElementById("modalConfirmDelete")).hide(); };
window.fmtMoeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function fmtMoedaSimples(v) { return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Lógica de Manutenção (Restore/Reset)
const formRestore = document.getElementById("form-restore");
if(formRestore) {
    formRestore.onsubmit = async (e) => {
        e.preventDefault();
        if(!confirm("⚠️ ATENÇÃO: Isso irá substituir todos os dados atuais pelos do backup. Deseja continuar?")) return;
        const fileInput = document.getElementById("arquivo-restore"); const fd = new FormData(); fd.append("arquivo", fileInput.files[0]);
        try { const res = await fetch("/api/manutencao/restore", { method: "POST", body: fd }); const json = await res.json(); if (res.ok) { alert("✅ " + json.msg); window.location.reload(); } else { alert("❌ Erro: " + json.erro); } } catch (e) { console.error(e); alert("Erro ao conectar com o servidor."); }
    };
}
window.confirmarReset = async () => { if(!confirm("🟥 PERIGO: Você tem certeza que deseja APAGAR TUDO? Essa ação não pode ser desfeita!")) return; if(!confirm("🟥 Confirme novamente: Todos os lançamentos serão perdidos. Continuar?")) return; try { const res = await fetch("/api/manutencao/reset", { method: "DELETE" }); const json = await res.json(); if (res.ok) { alert("✅ " + json.msg); window.location.reload(); } else { alert("❌ Erro: " + json.erro); } } catch (e) { console.error(e); alert("Erro ao resetar sistema."); } };

window.atualizarInterface = atualizarInterface; window.toggleVencimento = toggleVencimento; window.carregarPlanejamento = carregarPlanejamento; window.carregarSeletorAnos = carregarSeletorAnos; window.delLanc = delLanc; window.delVenc = delVenc; window.selectTipoConfig = selectTipoConfig; window.selectSubtipoConfig = selectSubtipoConfig; window.prepararExclusao = prepararExclusao; window.confirmarExclusao = confirmarExclusao; window.atualizarOpcoesFormulario = atualizarOpcoesFormulario; window.filtrarCategoriasNoLancamento = filtrarCategoriasNoLancamento; window.abrirModalPagamento = abrirModalPagamento;
init();