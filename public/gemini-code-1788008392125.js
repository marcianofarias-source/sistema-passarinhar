const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || "SUA_STRING_DE_CONEXAO_AQUI";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado ao MongoDB Atlas com sucesso!'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Schemas Otimizados com Índices
const userSchema = new mongoose.Schema({
    id: { type: Number, index: true },
    name: String,
    username: { type: String, unique: true, index: true },
    password: String,
    role: String
});

const clientSchema = new mongoose.Schema({
    id: { type: Number, index: true },
    name: { type: String, index: true },
    city: String,
    address: String,
    phone: String
});

const visitSchema = new mongoose.Schema({
    id: { type: Number, index: true },
    clientId: String,
    clientName: String,
    clientAddress: String,
    scheduledDate: { type: String, index: true },
    sellerId: { type: String, index: true },
    sellerName: String,
    status: { type: String, default: 'Agendada', index: true },
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
    const adminExists = await User.findOne({ username: 'admin' }).select('_id').lean();
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
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ 
            username: new RegExp(`^${username.trim()}$`, 'i'), 
            password: password 
        }).select('id name role').lean();
        
        if (user) {
            res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
        } else {
            res.status(401).json({ success: false, message: 'Usuário ou senha incorretos!' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

app.get('/api/users', async (req, res) => {
    const users = await User.find({}, { password: 0 }).lean();
    res.json(users);
});

app.post('/api/users', async (req, res) => {
    try {
        const exists = await User.findOne({ username: new RegExp(`^${req.body.username.trim()}$`, 'i') }).select('_id').lean();
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

        res.json({ success: true, user: { id: newUser.id, name: newUser.name, role: newUser.role } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao cadastrar usuário' });
    }
});

// Rota para alterar os dados do cadastro de vendedores/usuários
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, username, role } = req.body;

    try {
        const updatedUser = await User.findOneAndUpdate(
            { id: Number(id) },
            { name, username, role },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao alterar cadastro do usuário' });
    }
});

// ROTAS DE CLIENTES
app.get('/api/clients', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 0;
        const clients = await Client.find().sort({ id: -1 }).limit(limit).lean();
        res.json(clients);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao buscar clientes' });
    }
});

app.post('/api/clients', async (req, res) => {
    try {
        const newClient = await Client.create({
            id: Date.now(),
            name: req.body.name,
            city: req.body.city,
            address: req.body.address,
            phone: req.body.phone
        });
        res.json({ success: true, client: newClient });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao cadastrar cliente' });
    }
});

app.post('/api/clients/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const baseTimestamp = Date.now();

        // Mapeador flexível de colunas
        const getValue = (row, possibleKeys) => {
            for (const key of Object.keys(row)) {
                const cleanKey = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (possibleKeys.includes(cleanKey)) {
                    return String(row[key] || '').trim();
                }
            }
            return '';
        };

        const clientsToInsert = data
            .map((row, index) => {
                const name = getValue(row, ['nome do cliente', 'nome', 'name', 'cliente', 'razao social']);
                const city = getValue(row, ['cidade', 'city', 'municipio']);
                const address = getValue(row, ['endereco', 'address', 'rua', 'logradouro']);
                const phone = getValue(row, ['fone resid', 'telefone', 'fone', 'phone', 'celular']);

                return {
                    id: baseTimestamp + index,
                    name,
                    city,
                    address,
                    phone
                };
            })
            .filter(client => client.name !== '' || client.city !== '');

        if (clientsToInsert.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: 'Nenhum cliente válido encontrado.' });
        }

        await Client.insertMany(clientsToInsert, { ordered: false });
        fs.unlinkSync(req.file.path);
        
        res.json({ success: true, count: clientsToInsert.length });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: 'Erro ao processar arquivo: ' + error.message });
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
    
    const visits = await Visit.find(filter).lean();
    res.json(visits);
});

app.post('/api/visits', async (req, res) => {
    const client = await Client.findOne({ id: req.body.clientId }).select('name address').lean();

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
    const visit = await Visit.findOneAndUpdate({ id: req.params.id }, req.body, { new: true }).lean();
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

    const visits = await Visit.find(filter).lean();

    let completed = 0, inProgress = 0, scheduled = 0;
    for (let i = 0; i < visits.length; i++) {
        const st = visits[i].status;
        if (st === 'Concluída') completed++;
        else if (st === 'Em Andamento') inProgress++;
        else if (st === 'Agendada') scheduled++;
    }

    res.json({
        totalVisits: visits.length,
        completed,
        inProgress,
        scheduled,
        visits
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));