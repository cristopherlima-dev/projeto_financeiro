let dados = { lancamentos: [], tipos: [], subtipos: [], categorias: [] };
let charts = {};
let selConfig = { tipo: null, subtipo: null };
let deleteCallback = null;

async function init() {
  await carregarTudo();

  // CONFIGURAÇÕES INICIAIS
  const hoje = new Date();
  document.getElementById("filtro-mes").value = `${hoje.getFullYear()}-${String(
    hoje.getMonth() + 1
  ).padStart(2, "0")}`;

  // CARREGA LISTAS E GRÁFICOS
  await carregarSeletorAnos(); // <--- NOVO: Carrega os anos antes de tudo
  atualizarInterface();
  carregarVencimentos();
}

// --- NOVO: FUNÇÃO PARA BUSCAR ANOS NO BANCO ---
async function carregarSeletorAnos() {
  try {
    const res = await fetch("/api/anos_disponiveis");
    const anos = await res.json();

    const select = document.getElementById("filtro-ano-plan");
    if (!select) return;

    // Salva o valor atual se houver, senão usa o ano corrente
    const anoSelecionado = select.value || new Date().getFullYear().toString();

    select.innerHTML = ""; // Limpa opções antigas (hardcoded)

    anos.forEach((ano) => {
      const opt = document.createElement("option");
      opt.value = ano;
      opt.textContent = ano;
      if (ano.toString() === anoSelecionado) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Erro ao carregar anos:", e);
  }
}

async function carregarTudo() {
  try {
    const [l, t, s, c] = await Promise.all([
      fetch("/api/lancamentos").then((r) => r.json()),
      fetch("/api/config/tipos").then((r) => r.json()),
      fetch("/api/config/subtipos").then((r) => r.json()),
      fetch("/api/config/categorias").then((r) => r.json()),
    ]);
    dados.lancamentos = l;
    dados.tipos = t;
    dados.subtipos = s;
    dados.categorias = c;
    renderConfigLists();
    atualizarInterface();
    carregarSeletorAnos(); // Recarrega anos também ao atualizar dados (caso crie um lançamento novo num ano novo)
  } catch (e) {
    console.error(e);
  }
}

// --- O RESTANTE DO ARQUIVO PERMANECE IGUAL ---
// ... (Mantenha as funções carregarPlanejamento, renderConfigLists, charts, etc.) ...

// Apenas certifique-se de que a função init() no final está chamando carregarSeletorAnos() como mostrei acima.
// As funções abaixo (carregarPlanejamento, etc) não mudam.

async function carregarPlanejamento() {
  const ano = document.getElementById("filtro-ano-plan").value;
  const res = await fetch(`/api/planejamento?ano=${ano}`);
  const plan = await res.json();

  const tbody = document.getElementById("tbody-planejamento");
  tbody.innerHTML = "";

  const desenharSecao = (nomeTipo, corHeader) => {
    if (!plan[nomeTipo]) return;
    tbody.innerHTML += `<tr class="table-${corHeader}"><td colspan="14" class="fw-bold text-start text-uppercase">${nomeTipo}</td></tr>`;
    let totalMesesTipo = new Array(12).fill(0);

    for (const [subtipo, categorias] of Object.entries(plan[nomeTipo])) {
      tbody.innerHTML += `<tr><td colspan="14" class="fw-bold text-start bg-light ps-4 text-muted small">${subtipo.toUpperCase()}</td></tr>`;
      for (const [cat, valores] of Object.entries(categorias)) {
        let linhaHtml = `<td class="text-start ps-5">${cat}</td>`;
        let totalCat = 0;
        valores.forEach((v, idx) => {
          linhaHtml += `<td>${v > 0 ? fmtMoedaSimples(v) : "-"}</td>`;
          totalCat += v;
          totalMesesTipo[idx] += v;
        });
        linhaHtml += `<td class="fw-bold bg-light">${fmtMoedaSimples(
          totalCat
        )}</td>`;
        tbody.innerHTML += `<tr>${linhaHtml}</tr>`;
      }
    }
    let linhaTotal = `<td class="fw-bold text-start bg-${corHeader} text-dark">TOTAL ${nomeTipo.toUpperCase()}</td>`;
    let grandTotal = 0;
    totalMesesTipo.forEach((v) => {
      linhaTotal += `<td class="fw-bold bg-${corHeader} text-dark">${
        v > 0 ? fmtMoedaSimples(v) : "-"
      }</td>`;
      grandTotal += v;
    });
    linhaTotal += `<td class="fw-bold bg-dark text-white">${fmtMoedaSimples(
      grandTotal
    )}</td>`;
    tbody.innerHTML += `<tr>${linhaTotal}</tr>`;
  };

  desenharSecao("Entrada", "success");
  desenharSecao("Saída", "danger");
}

// ... (RESTO DO CÓDIGO JS, MODAIS, ETC) ...
function fmtMoedaSimples(v) {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
// ... (Copie o restante das funções auxiliares do script.js anterior se não tiver alterado nada) ...

// --- BLOCO FINAL DE HELPERS E EXPORTS ---
function showConfirmDelete(callback) {
  deleteCallback = callback;
  new bootstrap.Modal(document.getElementById("modalConfirmDelete")).show();
}
document.getElementById("btn-confirm-delete").onclick = () => {
  if (deleteCallback) deleteCallback();
  bootstrap.Modal.getInstance(
    document.getElementById("modalConfirmDelete")
  ).hide();
};

function renderConfigLists() {
  const divT = document.getElementById("lista-tipos");
  divT.innerHTML = "";
  dados.tipos.forEach(
    (t) =>
      (divT.innerHTML += `<a href="#" class="list-group-item list-group-item-action ${
        selConfig.tipo === t.id ? "active" : ""
      }" onclick="selectTipoConfig(${t.id}, event)"><span class="fw-bold">${
        t.nome
      }</span></a>`)
  );

  const divS = document.getElementById("lista-subtipos");
  divS.innerHTML = "";
  if (selConfig.tipo)
    dados.subtipos
      .filter((s) => s.tipo_id === selConfig.tipo)
      .forEach(
        (s) =>
          (divS.innerHTML += `<div class="list-group-item list-group-item-action ${
            selConfig.subtipo === s.id ? "active" : ""
          } d-flex justify-content-between align-items-center" onclick="selectSubtipoConfig(${
            s.id
          }, event)"><span>${
            s.nome
          }</span><span class="btn-excluir" onclick="prepararExclusao(this, 'subtipos', ${
            s.id
          }, event)">🗑️</span></div>`)
      );
  else
    divS.innerHTML =
      '<span class="text-muted small p-2">Selecione um Tipo.</span>';

  const divC = document.getElementById("lista-categorias");
  divC.innerHTML = "";
  if (selConfig.subtipo)
    dados.categorias
      .filter((c) => c.subtipo_id === selConfig.subtipo)
      .forEach(
        (c) =>
          (divC.innerHTML += `<div class="list-group-item d-flex justify-content-between align-items-center"><span>${c.nome}</span><span class="btn-excluir" onclick="prepararExclusao(this, 'categorias', ${c.id}, event)">🗑️</span></div>`)
      );
  else
    divC.innerHTML =
      '<span class="text-muted small p-2">Selecione um Subtipo.</span>';

  const tSel = dados.tipos.find((t) => t.id === selConfig.tipo);
  const sSel = dados.subtipos.find((s) => s.id === selConfig.subtipo);
  document.getElementById("lbl-tipo-selecionado").textContent = tSel
    ? tSel.nome
    : "---";
  document.getElementById("lbl-subtipo-selecionado").textContent = sSel
    ? sSel.nome
    : "---";
}

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
  el.outerHTML = `<span onclick="event.stopPropagation()"><span class="text-danger fw-bold small me-2">Apagar?</span><button class="btn btn-sm btn-danger py-0 px-2" onclick="confirmarExclusao('${endpoint}', ${id})">Sim</button><button class="btn btn-sm btn-secondary py-0 px-2" onclick="renderConfigLists()">Não</button></span>`;
}
async function confirmarExclusao(endpoint, id) {
  await fetch(`/api/config/${endpoint}?id=${id}`, { method: "DELETE" });
  carregarTudo();
}

document.getElementById("form-subtipo").onsubmit = async (e) => {
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
document.getElementById("form-categoria").onsubmit = async (e) => {
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

window.prepararModal = () => {
  document.getElementById("inp-data").value = new Date()
    .toISOString()
    .split("T")[0];
  document.getElementById("form-lancamento").reset();
  carregarTiposNoModal();
};
function carregarTiposNoModal() {
  const sel = document.getElementById("inp-tipo");
  sel.innerHTML = '<option value="">Selecione...</option>';
  dados.tipos.forEach(
    (t) => (sel.innerHTML += `<option value="${t.id}">${t.nome}</option>`)
  );
  document.getElementById("inp-subtipo").innerHTML = "";
  document.getElementById("inp-categoria").innerHTML = "";
}
window.carregarSubtiposNoModal = () => {
  const tid = parseInt(document.getElementById("inp-tipo").value);
  const sel = document.getElementById("inp-subtipo");
  sel.innerHTML = '<option value="">Selecione...</option>';
  if (tid)
    dados.subtipos
      .filter((s) => s.tipo_id === tid)
      .forEach(
        (s) => (sel.innerHTML += `<option value="${s.id}">${s.nome}</option>`)
      );
  document.getElementById("inp-categoria").innerHTML = "";
};
window.carregarCategoriasNoModal = () => {
  const sid = parseInt(document.getElementById("inp-subtipo").value);
  const sel = document.getElementById("inp-categoria");
  sel.innerHTML = '<option value="">Selecione...</option>';
  if (sid)
    dados.categorias
      .filter((c) => c.subtipo_id === sid)
      .forEach(
        (c) => (sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`)
      );
};

document.getElementById("form-lancamento").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append("data", document.getElementById("inp-data").value);
  fd.append("descricao", document.getElementById("inp-desc").value);
  fd.append("valor", document.getElementById("inp-valor").value);
  fd.append("tipo_id", document.getElementById("inp-tipo").value);
  fd.append("subtipo_id", document.getElementById("inp-subtipo").value);
  fd.append("categoria_id", document.getElementById("inp-categoria").value);
  const arq = document.getElementById("inp-arquivo");
  if (arq.files.length) fd.append("arquivo", arq.files[0]);
  if ((await fetch("/api/lancamentos", { method: "POST", body: fd })).ok) {
    bootstrap.Modal.getInstance(
      document.getElementById("modalLancamento")
    ).hide();
    carregarTudo();
  } else alert("Erro ao salvar.");
};

function atualizarInterface() {
  const mes = document.getElementById("filtro-mes").value;
  const lista = dados.lancamentos.filter((l) => l.data.startsWith(mes));
  const tbody = document.getElementById("tabela-lancamentos-body");
  tbody.innerHTML = "";
  let tot = { entOk: 0, entPen: 0, saiOk: 0, saiPen: 0 };
  lista.sort((a, b) => new Date(b.data) - new Date(a.data));
  lista.forEach((l) => {
    if (l.tipo === "Entrada") {
      if (l.efetivado) tot.entOk += l.valor;
      else tot.entPen += l.valor;
    } else {
      if (l.efetivado) tot.saiOk += l.valor;
      else tot.saiPen += l.valor;
    }
    const cor = l.tipo === "Entrada" ? "text-success" : "text-danger";
    const anexoHtml = l.comprovante
      ? `<a href="/uploads/${l.comprovante}" target="_blank" class="text-decoration-none ms-2" title="Abrir Anexo">📎</a>`
      : "";
    tbody.innerHTML += `<tr><td><input type="checkbox" onchange="toggleStatus(${
      l.id
    })" ${l.efetivado ? "checked" : ""}></td><td>${l.data
      .split("-")
      .reverse()
      .join("/")}</td><td>${l.descricao} ${anexoHtml}</td><td>${
      l.tipo
    }</td><td>${l.subtipo}</td><td>${
      l.categoria
    }</td><td class="${cor}">${fmtMoeda(
      l.valor
    )}</td><td><button class="btn btn-sm btn-outline-danger border-0" onclick="delLanc(${
      l.id
    })">🗑️</button></td></tr>`;
  });
  document.getElementById("card-ent-ok").innerText = fmtMoeda(tot.entOk);
  document.getElementById("card-ent-pend").innerText = fmtMoeda(tot.entPen);
  document.getElementById("card-sai-ok").innerText = fmtMoeda(tot.saiOk);
  document.getElementById("card-sai-pend").innerText = fmtMoeda(tot.saiPen);
  document.getElementById("card-saldo").innerText = fmtMoeda(
    tot.entOk - tot.saiOk
  );
  drawChartBalanco(tot.entOk, tot.saiOk);
  const ef = lista.filter((l) => l.efetivado);
  drawChart("chartEntSub", ef, "Entrada", "subtipo");
  drawChart("chartEntCat", ef, "Entrada", "categoria");
  drawChart("chartSaiSub", ef, "Saída", "subtipo");
  drawChart("chartSaiCat", ef, "Saída", "categoria");
}

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
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (c) {
              let v = c.raw;
              return (
                (c.label || "") +
                ": " +
                fmtMoeda(v) +
                " (" +
                (e + s > 0 ? ((v / (e + s)) * 100).toFixed(1) + "%" : "0%") +
                ")"
              );
            },
          },
        },
      },
    },
  });
}
function drawChart(id, d, f, c) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const i = d.filter((l) => l.tipo === f);
  const g = {};
  let t = 0;
  i.forEach((x) => {
    const k = x[c] || "Outros";
    g[k] = (g[k] || 0) + x.valor;
    t += x.valor;
  });
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(g),
      datasets: [
        {
          data: Object.values(g),
          backgroundColor: [
            "#0d6efd",
            "#6610f2",
            "#d63384",
            "#dc3545",
            "#ffc107",
            "#198754",
            "#20c997",
            "#0dcaf0",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (k) {
              let v = k.raw;
              return (
                (k.label || "") +
                ": " +
                fmtMoeda(v) +
                " (" +
                (t > 0 ? ((v / t) * 100).toFixed(1) + "%" : "0%") +
                ")"
              );
            },
          },
        },
      },
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
async function carregarVencimentos() {
  try {
    const l = await fetch("/api/vencimentos").then((r) => r.json());
    const tb = document.getElementById("tabela-vencimentos-body");
    tb.innerHTML = "";
    l.forEach((v) => {
      const sw = `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" onchange="toggleVencimento(${
        v.id
      })" ${v.ativo ? "checked" : ""}></div>`;
      const dt =
        v.tipo === "fixo"
          ? `Todo dia ${v.dia}`
          : v.data_vencimento
          ? v.data_vencimento.split("-").reverse().join("/")
          : "-";
      tb.innerHTML += `<tr><td>${v.descricao}</td><td>${v.tipo}</td><td>${dt}</td><td>${sw}</td><td><button class="btn btn-sm btn-outline-danger border-0" onclick="delVenc(${v.id})">🗑️</button></td></tr>`;
    });
  } catch (e) {
    console.error(e);
  }
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
      dia:
        document.getElementById("venc-tipo").value === "fixo"
          ? parseInt(document.getElementById("venc-dia").value)
          : null,
      data_vencimento:
        document.getElementById("venc-tipo").value === "variavel"
          ? document.getElementById("venc-data").value
          : null,
    };
    if (
      await fetch("/api/vencimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      })
    ) {
      fV.reset();
      bootstrap.Modal.getInstance(
        document.getElementById("modalVencimento")
      ).hide();
      carregarVencimentos();
    }
  });
window.alternarCamposVencimento = () => {
  const t = document.getElementById("venc-tipo").value;
  document
    .getElementById("div-dia-fixo")
    .classList.toggle("d-none", t !== "fixo");
  document
    .getElementById("div-data-variavel")
    .classList.toggle("d-none", t !== "variavel");
};
window.fmtMoeda = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
window.atualizarInterface = atualizarInterface;
window.toggleVencimento = toggleVencimento;
window.carregarPlanejamento = carregarPlanejamento;
window.carregarSeletorAnos = carregarSeletorAnos; // EXPORTADA

init();
