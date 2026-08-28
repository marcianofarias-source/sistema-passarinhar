const express = require('express');
const cors = require('cors'); // <--- 1. Adicione esta linha
const app = express();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(cors()); // <--- 2. Adicione esta linha ANTES de app.use(express.json()) e das rotas
app.use(express.json());
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');


const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CLIENTS_FILE = path.join(__dirname, 'clients.json');

function readClients() {
    if (!fs.existsSync(CLIENTS_FILE)) {
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify([], null, 2));
    }
    const data = fs.readFileSync(CLIENTS_FILE, 'utf-8');
    try {
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveClients(clients) {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

let users = [
    // Localize the list of users and replace with this structure:
let users = [
  { 
    id: 1, 
    name: 'Administrador', 
    username: 'admin', 
    password: 'Amt@10', // coloque a senha que você deseja usar
    role: 'Administrador' 
  }
];

let visits = [];
let activeLocations = {};

// Autenticação
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password);
    
    if (user) {
        res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha incorretos!' });
    }
});

// Usuários
app.get('/api/users', (req, res) => {
    res.json(users.map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role })));
});

app.post('/api/users', (req, res) => {
    const newUser = { 
        id: Date.now(), 
        name: req.body.name,
        username: req.body.username,
        password: req.body.password || '123',
        role: req.body.role
    };
    users.push(newUser);
    res.json({ success: true, user: newUser });
});

// Clientes
app.get('/api/clients', (req, res) => {
    res.json(readClients());
});

app.post('/api/clients', (req, res) => {
    const clients = readClients();
    const newClient = {
        id: Date.now(),
        name: req.body.name,
        city: req.body.city,
        address: req.body.address || '',
        phone: req.body.phone || ''
    };
    clients.push(newClient);
    saveClients(clients);
    res.json({ success: true, client: newClient });
});

// Importação Excel
app.post('/api/clients/import', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const clients = readClients();
        data.forEach(row => {
            clients.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: row.Nome || row.nome || row.Name || '',
                city: row.Cidade || row.cidade || row.City || '',
                address: row.Endereço || row.Endereco || row.endereço || row.endereco || row.Address || '',
                phone: row.Telefone || row.telefone || row.Phone || ''
            });
        });

        saveClients(clients);
        fs.unlinkSync(req.file.path);

        res.json({ success: true, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao processar o arquivo Excel' });
    }
});

// GPS
app.post('/api/tracking/update', (req, res) => {
    const { sellerId, sellerName, lat, lng } = req.body;
    activeLocations[sellerId] = {
        sellerId,
        sellerName,
        lat,
        lng,
        timestamp: new Date().toISOString()
    };
    res.json({ success: true });
});

app.get('/api/tracking/active', (req, res) => {
    res.json(Object.values(activeLocations));
});

// Visitas
app.get('/api/visits', (req, res) => {
    const { sellerId, userRole } = req.query;

    if (userRole === 'Vendedor' || (sellerId && sellerId !== 'all')) {
        return res.json(visits.filter(v => v.sellerId == sellerId));
    }
    
    res.json(visits);
});

app.post('/api/visits', (req, res) => {
    const clients = readClients();
    const client = clients.find(c => c.id == req.body.clientId);

    const newVisit = {
        id: Date.now(),
        clientId: req.body.clientId,
        clientName: client ? client.name : 'Cliente Não Encontrado',
        clientAddress: client ? client.address : '',
        scheduledDate: req.body.scheduledDate,
        sellerId: req.body.sellerId,
        sellerName: req.body.sellerName,
        status: 'Agendada',
        notes: '',
        startTime: null,
        endTime: null,
        startLat: null,
        startLng: null,
        endLat: null,
        endLng: null
    };

    visits.push(newVisit);
    res.json({ success: true, visit: newVisit });
});

app.put('/api/visits/:id', (req, res) => {
    const visitId = req.params.id;
    const index = visits.findIndex(v => v.id == visitId);

    if (index !== -1) {
        visits[index] = { ...visits[index], ...req.body };
        res.json({ success: true, visit: visits[index] });
    } else {
        res.status(404).json({ success: false, message: 'Visita não encontrada' });
    }
});

// Relatórios
app.get('/api/reports/summary', (req, res) => {
    const { startDate, endDate, sellerId, userRole } = req.query;

    if (userRole === 'Vendedor') {
        return res.status(403).json({ success: false, message: 'Acesso negado aos relatórios.' });
    }

    let filtered = visits;

    if (sellerId && sellerId !== 'all') {
        filtered = filtered.filter(v => v.sellerId == sellerId);
    }

    if (startDate && endDate) {
        filtered = filtered.filter(v => {
            const date = v.scheduledDate;
            return date >= startDate && date <= endDate;
        });
    }

    res.json({
        totalVisits: filtered.length,
        completed: filtered.filter(v => v.status === 'Concluída').length,
        inProgress: filtered.filter(v => v.status === 'Em Andamento').length,
        scheduled: filtered.filter(v => v.status === 'Agendada').length,
        visits: filtered
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Passarinhar rodando na porta ${PORT}`);
});