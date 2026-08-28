const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Configuração completa de CORS para liberar requisições do Firebase/qualquer origem
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || "SUA_STRING_DE_CONEXAO_AQUI";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado ao MongoDB Atlas com sucesso!'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

const userSchema = new mongoose.Schema({
    id: Number,
    name: String,
    username: { type: String, unique: true },
    password: String,
    role: String
});

const clientSchema = new mongoose.Schema({
    id: Number,
    name: String,
    city: String,
    address: String,
    phone: String
});

const visitSchema = new mongoose.Schema({
    id: Number,
    clientId: String,
    clientName: String,
    clientAddress: String,
    scheduledDate: String,
    sellerId: String,
    sellerName: String,
    status: { type: String, default: 'Agendada' },
    notes: String,
    startTime: String,
    endTime: String,
    startLat: Number,
    startLng: Number,
    endLat: Number,
    endLng: Number
});

const User = mongoose.model('User', userSchema);
const Client = mongoose.model('Client', clientSchema);
const Visit = mongoose.model('Visit', visitSchema);

let activeLocations = {};

async function initAdmin() {
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
        await User.create({
            id: 1,
            name: 'Administrador',
            username: 'admin',
            password: 'Amt@1995',
            role: 'Administrador'
        });
        console.log('Usuário Admin criado por padrão.');
    }
}
initAdmin();

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ 
        username: new RegExp(`^${username.trim()}$`, 'i'), 
        password: password 
    });
    
    if (user) {
        res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha incorretos!' });
    }
});

app.get('/api/users', async (req, res) => {
    const users = await User.find({}, { password: 0 });
    res.json(users);
});

app.post('/api/users', async (req, res) => {
    try {
        const exists = await User.findOne({ username: new RegExp(`^${req.body.username.trim()}$`, 'i') });
        if (exists) {
            return res.status(400).json({ success: false, message: 'Nome de usuário já existe!' });
        }

        const newUser = await User.create({
            id: Date.now(),
            name: req.body.name,
            username: req.body.username,
            password: req.body.password,
            role: req.body.role
        });

        res.json({ success: true, user: newUser });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao cadastrar usuário' });
    }
});

app.get('/api/clients', async (req, res) => {
    const clients = await Client.find();
    res.json(clients);
});

app.post('/api/clients', async (req, res) => {
    const newClient = await Client.create({
        id: Date.now(),
        name: req.body.name,
        city: req.body.city,
        address: req.body.address || '',
        phone: req.body.phone || ''
    });
    res.json({ success: true, client: newClient });
});

app.post('/api/clients/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const clientsToInsert = data.map(row => ({
            id: Date.now() + Math.floor(Math.random() * 10000),
            name: row.Nome || row.nome || row.Name || '',
            city: row.Cidade || row.cidade || row.City || '',
            address: row.Endereço || row.Endereco || row.address || '',
            phone: row.Telefone || row.telefone || row.Phone || ''
        }));

        await Client.insertMany(clientsToInsert);
        res.json({ success: true, count: data.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao processar Excel' });
    }
});

app.post('/api/tracking/update', (req, res) => {
    const { sellerId, sellerName, lat, lng } = req.body;
    activeLocations[sellerId] = {
        sellerId, sellerName, lat, lng, timestamp: new Date().toISOString()
    };
    res.json({ success: true });
});

app.get('/api/tracking/active', (req, res) => {
    res.json(Object.values(activeLocations));
});

app.get('/api/visits', async (req, res) => {
    const { sellerId, userRole } = req.query;
    let filter = { status: { $ne: 'Concluída' } };

    if (userRole === 'Vendedor' || (sellerId && sellerId !== 'all')) {
        filter.sellerId = sellerId;
    }
    
    const visits = await Visit.find(filter);
    res.json(visits);
});

app.post('/api/visits', async (req, res) => {
    const client = await Client.findOne({ id: req.body.clientId });

    const newVisit = await Visit.create({
        id: Date.now(),
        clientId: req.body.clientId,
        clientName: client ? client.name : 'Cliente Não Encontrado',
        clientAddress: client ? client.address : '',
        scheduledDate: req.body.scheduledDate,
        sellerId: req.body.sellerId,
        sellerName: req.body.sellerName,
        status: 'Agendada'
    });

    res.json({ success: true, visit: newVisit });
});

app.put('/api/visits/:id', async (req, res) => {
    const visit = await Visit.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    if (visit) {
        res.json({ success: true, visit });
    } else {
        res.status(404).json({ success: false, message: 'Visita não encontrada' });
    }
});

app.get('/api/reports/summary', async (req, res) => {
    const { startDate, endDate, sellerId, userRole } = req.query;

    if (userRole === 'Vendedor') {
        return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }

    let filter = {};

    if (sellerId && sellerId !== 'all') {
        filter.sellerId = sellerId;
    }

    if (startDate && endDate) {
        filter.scheduledDate = { $gte: startDate, $lte: endDate };
    }

    const visits = await Visit.find(filter);

    res.json({
        totalVisits: visits.length,
        completed: visits.filter(v => v.status === 'Concluída').length,
        inProgress: visits.filter(v => v.status === 'Em Andamento').length,
        scheduled: visits.filter(v => v.status === 'Agendada').length,
        visits: visits
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));