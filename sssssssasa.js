const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'database.json');

// Função para ler os dados salvos
function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = {
            users: [
                { id: 1, name: 'Admin', username: 'admin', password: '123', role: 'Administrador' }
            ],
            clients: [],
            visits: [],
            tracking: []
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    const rawData = fs.readFileSync(DATA_FILE);
    return JSON.parse(rawData);
}

// Função para gravar os dados no arquivo
function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API: LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = loadData();
    const user = db.users.find(u => u.username === username && u.password === password);

    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha incorretos!' });
    }
});

// API: LISTAR USUÁRIOS
app.get('/api/users', (req, res) => {
    const db = loadData();
    res.json(db.users);
});

// API: CADASTRAR USUÁRIO (Salva permanentemente)
app.post('/api/users', (req, res) => {
    const db = loadData();
    const newUser = { id: Date.now(), ...req.body };
    db.users.push(newUser);
    saveData(db);
    res.json({ success: true, user: newUser });
});

// API: LISTAR CLIENTES
app.get('/api/clients', (req, res) => {
    const db = loadData();
    res.json(db.clients);
});

// API: CADASTRAR CLIENTE
app.post('/api/clients', (req, res) => {
    const db = loadData();
    const newClient = { id: Date.now(), ...req.body };
    db.clients.push(newClient);
    saveData(db);
    res.json({ success: true, client: newClient });
});

// API: LISTAR VISITAS
app.get('/api/visits', (req, res) => {
    const { sellerId } = req.query;
    const db = loadData();
    
    if (sellerId && sellerId !== 'all') {
        const filtered = db.visits.filter(v => String(v.sellerId) === String(sellerId));
        return res.json(filtered);
    }
    res.json(db.visits);
});

// API: CRIAR VISITA
app.post('/api/visits', (req, res) => {
    const db = loadData();
    const client = db.clients.find(c => String(c.id) === String(req.body.clientId));
    
    const newVisit = {
        id: Date.now(),
        clientName: client ? client.name : 'Cliente',
        clientAddress: client ? client.address : '',
        status: 'Agendada',
        ...req.body
    };
    
    db.visits.push(newVisit);
    saveData(db);
    res.json({ success: true, visit: newVisit });
});

// API: ATUALIZAR STATUS DA VISITA
app.put('/api/visits/:id', (req, res) => {
    const { id } = req.params;
    const db = loadData();
    const index = db.visits.findIndex(v => String(v.id) === String(id));

    if (index !== -1) {
        db.visits[index] = { ...db.visits[index], ...req.body };
        saveData(db);
        res.json({ success: true, visit: db.visits[index] });
    } else {
        res.status(404).json({ success: false, message: 'Visita não encontrada.' });
    }
});

// API: RELATÓRIOS
app.get('/api/reports/summary', (req, res) => {
    const { startDate, endDate, sellerId } = req.query;
    const db = loadData();

    let filtered = db.visits;

    if (sellerId && sellerId !== 'all') {
        filtered = filtered.filter(v => String(v.sellerId) === String(sellerId));
    }

    if (startDate && endDate) {
        filtered = filtered.filter(v => v.scheduledDate >= startDate && v.scheduledDate <= endDate);
    }

    const completed = filtered.filter(v => v.status === 'Concluída').length;
    const inProgress = filtered.filter(v => v.status === 'Em Andamento').length;
    const scheduled = filtered.filter(v => v.status === 'Agendada').length;

    res.json({
        totalVisits: filtered.length,
        completed,
        inProgress,
        scheduled,
        visits: filtered
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));