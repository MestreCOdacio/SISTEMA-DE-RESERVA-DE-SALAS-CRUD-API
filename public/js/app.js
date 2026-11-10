// --- UTILIDADES ---
function mostrarSessao(id) {
    document.getElementById('sec-salas').style.display = id === 'salas' ? 'block' : 'none';
    document.getElementById('sec-reservas').style.display = id === 'reservas' ? 'block' : 'none';
}

function exibirMensagem(msg, tipo = 'sucesso') {
    const div = document.getElementById('mensagem-alerta');
    div.textContent = msg;
    div.className = tipo;
    setTimeout(() => { div.textContent = ''; div.className = ''; }, 4000);
}

// --- INTEGRAÇÃO BRASIL API (FERIADOS) ---
async function verificarFeriado() {
    const inputData = document.getElementById('r-data').value;
    const avisoSpan = document.getElementById('aviso-feriado');
    avisoSpan.textContent = ''; // Limpa aviso anterior

    if (!inputData) return;

    const ano = inputData.split('-')[0]; // Extrai o ano da data (YYYY-MM-DD)
    
    try {
        const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (!res.ok) throw new Error('API Indisponível');
        
        const feriados = await res.json();
        // Verifica se a data selecionada existe no array retornado pela API
        const feriadoEncontrado = feriados.find(f => f.date === inputData);
        
        if (feriadoEncontrado) {
            avisoSpan.textContent = `⚠️ Atenção: Esta data é feriado nacional (${feriadoEncontrado.name}).`;
        }
    } catch (error) {
        console.warn('Erro ao consultar BrasilAPI:', error);
        // Regra: "Caso a API esteja indisponível... permitir continuar" -> Apenas ignoramos no frontend
    }
}

// --- SALAS ---
document.getElementById('form-sala').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sala = {
        nome: document.getElementById('s-nome').value,
        localizacao: document.getElementById('s-local').value,
        capacidade: parseInt(document.getElementById('s-capacidade').value),
        recursos: document.getElementById('s-recursos').value,
        situacao: document.getElementById('s-situacao').value
    };

    const res = await fetch('/api/salas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sala)
    });

    if (res.ok) {
        exibirMensagem('Sala cadastrada com sucesso!');
        e.target.reset();
        carregarSalas();
    } else {
        const err = await res.json();
        exibirMensagem(err.error, 'erro');
    }
});

async function carregarSalas() {
    const res = await fetch('/api/salas');
    const salas = await res.json();
    
    const tbody = document.querySelector('#tabela-salas tbody');
    const selectReserva = document.getElementById('r-sala');
    const selectFiltro = document.getElementById('filtro-sala');
    
    tbody.innerHTML = '';
    selectReserva.innerHTML = '<option value="">Selecione uma sala...</option>';
    selectFiltro.innerHTML = '<option value="">Todas as Salas</option>';

    salas.forEach(s => {
        const classeSit = s.situacao === 'Inativa' ? 'status-inativa' : '';
        tbody.innerHTML += `
            <tr class="${classeSit}">
                <td>${s.nome}</td><td>${s.localizacao}</td><td>${s.capacidade} pessoas</td><td>${s.situacao}</td>
                <td><button style="background:#e74c3c" onclick="deletarSala('${s.id}')">Excluir</button></td>
            </tr>
        `;
        // Preenche selects
        selectReserva.innerHTML += `<option value="${s.id}">${s.nome} (Cap: ${s.capacidade})</option>`;
        selectFiltro.innerHTML += `<option value="${s.id}">${s.nome}</option>`;
    });
}

async function deletarSala(id) {
    if (!confirm('Excluir esta sala?')) return;
    const res = await fetch(`/api/salas/${id}`, { method: 'DELETE' });
    if (res.ok) {
        exibirMensagem('Sala excluída!');
        carregarSalas();
    } else {
        const err = await res.json();
        exibirMensagem(err.error, 'erro');
    }
}

// --- RESERVAS ---
document.getElementById('form-reserva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reserva = {
        aluno: document.getElementById('r-aluno').value,
        email: document.getElementById('r-email').value,
        salaId: document.getElementById('r-sala').value,
        data: document.getElementById('r-data').value,
        horaInicio: document.getElementById('r-inicio').value,
        horaFim: document.getElementById('r-fim').value,
        participantes: parseInt(document.getElementById('r-participantes').value),
        finalidade: document.getElementById('r-finalidade').value
    };

    const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reserva)
    });

    if (res.ok) {
        exibirMensagem('Reserva realizada com sucesso!');
        e.target.reset();
        document.getElementById('aviso-feriado').textContent = '';
        carregarReservas();
    } else {
        const err = await res.json();
        exibirMensagem(err.error, 'erro'); // Mostra erros de conflito ou capacidade
    }
});

async function carregarReservas() {
    const filtroData = document.getElementById('filtro-data').value;
    const filtroSala = document.getElementById('filtro-sala').value;

    const [resReservas, resSalas] = await Promise.all([
        fetch('/api/reservas'),
        fetch('/api/salas')
    ]);
    
    let reservas = await resReservas.json();
    const salas = await resSalas.json();

    // Aplica os filtros localmente
    if (filtroData) reservas = reservas.filter(r => r.data === filtroData);
    if (filtroSala) reservas = reservas.filter(r => r.salaId === filtroSala);

    const tbody = document.querySelector('#tabela-reservas tbody');
    tbody.innerHTML = '';

    reservas.forEach(r => {
        const sala = salas.find(s => s.id === r.salaId) || { nome: 'Sala Removida' };
        const dataFormatada = r.data.split('-').reverse().join('/');
        const classeStatus = r.status === 'Ativa' ? 'status-ativa' : 'status-cancelada';
        
        let acoes = r.status === 'Ativa' 
            ? `<button style="background:#f39c12" onclick="cancelarReserva('${r.id}')">Cancelar</button>`
            : `<button style="background:#c0392b" onclick="deletarReserva('${r.id}')">Apagar</button>`;

        tbody.innerHTML += `
            <tr>
                <td>${r.aluno}</td>
                <td>${sala.nome}</td>
                <td>${dataFormatada} (${r.horaInicio} às ${r.horaFim})</td>
                <td class="${classeStatus}">${r.status}</td>
                <td>${acoes}</td>
            </tr>
        `;
    });
}

async function cancelarReserva(id) {
    if (!confirm('Deseja realmente cancelar esta reserva?')) return;
    await fetch(`/api/reservas/${id}`, {
        method: 'PUT', // Usamos PUT para atualizar apenas o status
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelada' })
    });
    carregarReservas();
}

async function deletarReserva(id) {
    if (!confirm('Apagar o histórico desta reserva?')) return;
    await fetch(`/api/reservas/${id}`, { method: 'DELETE' });
    carregarReservas();
}

// Inicialização das listagens na tela
carregarSalas();
carregarReservas();