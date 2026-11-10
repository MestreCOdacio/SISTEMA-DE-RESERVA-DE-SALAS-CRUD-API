const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const getBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => resolve(body ? JSON.parse(body) : {}));
        req.on('error', reject);
    });
};

const server = http.createServer(async (req, res) => {
    // 1. ARQUIVOS ESTÁTICOS (Front-end)
    if (!req.url.startsWith('/api')) {
        let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
        const extnames = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
        fs.readFile(filePath, (err, content) => {
            if (err) return res.writeHead(404).end('Página não encontrada');
            res.writeHead(200, { 'Content-Type': extnames[path.extname(filePath)] || 'text/plain' });
            res.end(content);
        });
        return;
    }

    // 2. API REST
    res.setHeader('Content-Type', 'application/json');
    const parts = req.url.split('?')[0].split('/'); // Ignora query strings
    const resource = parts[2];
    const id = parts[3];

    try {
        const db = readDB();

        // ==========================================
        // ENDPOINTS: SALAS
        // ==========================================
        if (resource === 'salas') {
            if (req.method === 'GET') {
                return res.writeHead(200).end(JSON.stringify(db.salas));
            }
            if (req.method === 'POST') {
                const data = await getBody(req);
                data.id = crypto.randomUUID();
                db.salas.push(data);
                writeDB(db);
                return res.writeHead(201).end(JSON.stringify(data));
            }
            if (req.method === 'DELETE' && id) {
                // REGRA: Impedir exclusão de salas com reservas vinculadas
                if (db.reservas.some(r => r.salaId === id)) {
                    return res.writeHead(400).end(JSON.stringify({ error: 'Sala possui reservas vinculadas e não pode ser excluída.' }));
                }
                db.salas = db.salas.filter(s => s.id !== id);
                writeDB(db);
                return res.writeHead(200).end(JSON.stringify({ message: 'Sala excluída' }));
            }
            if (req.method === 'PUT' && id) {
                const data = await getBody(req);
                const index = db.salas.findIndex(s => s.id === id);
                if (index !== -1) {
                    db.salas[index] = { ...db.salas[index], ...data };
                    writeDB(db);
                    return res.writeHead(200).end(JSON.stringify(db.salas[index]));
                }
            }
        }

        // ==========================================
        // ENDPOINTS: RESERVAS
        // ==========================================
        if (resource === 'reservas') {
            if (req.method === 'GET') {
                return res.writeHead(200).end(JSON.stringify(db.reservas));
            }
            if (req.method === 'POST') {
                const data = await getBody(req);
                data.status = 'Ativa'; // Status padrão
                
                const sala = db.salas.find(s => s.id === data.salaId);
                if (!sala) return res.writeHead(404).end(JSON.stringify({ error: 'Sala inexistente.' }));

                // REGRA: Salas inativas não recebem reservas
                if (sala.situacao === 'Inativa') {
                    return res.writeHead(400).end(JSON.stringify({ error: 'Esta sala está inativa.' }));
                }

                // REGRA: Validação de Horários
                if (data.horaInicio >= data.horaFim) {
                    return res.writeHead(400).end(JSON.stringify({ error: 'O horário final deve ser maior que o inicial.' }));
                }

                // REGRA: Capacidade
                if (data.participantes > sala.capacidade) {
                    return res.writeHead(400).end(JSON.stringify({ error: `Capacidade excedida. Máximo permitido: ${sala.capacidade}` }));
                }

                // REGRA: Conflito de horários (interseção de intervalos)
                const temConflito = db.reservas.some(r => {
                    return r.salaId === data.salaId && 
                           r.data === data.data && 
                           r.status === 'Ativa' &&
                           (data.horaInicio < r.horaFim && data.horaFim > r.horaInicio);
                });

                if (temConflito) {
                    return res.writeHead(409).end(JSON.stringify({ error: 'Conflito de horários! A sala já possui reserva ativa neste período.' }));
                }

                data.id = crypto.randomUUID();
                db.reservas.push(data);
                writeDB(db);
                return res.writeHead(201).end(JSON.stringify(data));
            }
            if (req.method === 'DELETE' && id) {
                db.reservas = db.reservas.filter(r => r.id !== id);
                writeDB(db);
                return res.writeHead(200).end(JSON.stringify({ message: 'Reserva excluída' }));
            }
            if (req.method === 'PUT' && id) {
                const data = await getBody(req); // Usado para cancelar reserva
                const index = db.reservas.findIndex(r => r.id === id);
                if (index !== -1) {
                    db.reservas[index].status = data.status || db.reservas[index].status;
                    writeDB(db);
                    return res.writeHead(200).end(JSON.stringify(db.reservas[index]));
                }
            }
        }

        res.writeHead(404).end(JSON.stringify({ error: 'Rota da API não encontrada' }));
    } catch (error) {
        console.error(error);
        res.writeHead(500).end(JSON.stringify({ error: 'Erro interno no servidor' }));
    }
});

server.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));