const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');

const app = express();
const upload = multer({ dest: 'uploads/' });

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

// --- AUTENTICAÇÃO ---
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

// --- USUÁRIOS / VENDEDORES ---
app.get('/api/users', async (req, res) => {
    const users = await User.find({}, { password: 0 });
    res.json(users);
});

app.post('/api/users', async (req, res) => {
    try {
        const exists = await User.findOne({ username: new RegExp(`^${req.body.username.trim()}$`, 'i') });
        if (exists) return res.status(400).json({ success: false, message: 'Nome de usuário já existe!' });

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

app.put('/api/users/:id', async (req, res) => {
    try {
        const updateData = {
            name: req.body.name,
            username: req.body.username,
            role: req.body.role
        };
        if (req.body.password && req.body.password.trim() !== '') {
            updateData.password = req.body.password;
        }

        const updatedUser = await User.findOneAndUpdate({ id: req.params.id }, updateData, { new: true, select: '-password' });
        if (!updatedUser) return res.status(404).json({ success: false, message: 'Usuário não encontrado' });

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar usuário' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const deletedUser = await User.findOneAndDelete({ id: req.params.id });
        if (!deletedUser) return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        res.json({ success: true, message: 'Usuário excluído com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao excluir usuário' });
    }
});

// --- CLIENTES ---
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

app.put('/api/clients/:id', async (req, res) => {
    try {
        const updatedClient = await Client.findOneAndUpdate(
            { id: req.params.id },
            {
                name: req.body.name,
                city: req.body.city,
                address: req.body.address,
                phone: req.body.phone
            },
            { new: true }
        );
        if (!updatedClient) return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        res.json({ success: true, client: updatedClient });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar cliente' });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    try {
        const deletedClient = await Client.findOneAndDelete({ id: req.params.id });
        if (!deletedClient) return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        res.json({ success: true, message: 'Cliente excluído com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao excluir cliente' });
    }
});

app.post('/api/clients/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const clientsToInsert = data.map(row => {
            const name = row['Razão Social'] || row['Razao Social'] || row['Nome'] || row['nome'] || row['Name'] || '';
            const phone = row['Fone Resid'] || row['Fone'] || row['Telefone'] || row['telefone'] || row['Phone'] || row['Celular'] || '';
            const city = row['Cidade'] || row['cidade'] || row['City'] || '';
            const uf = row['UF'] || row['uf'] || '';
            const fullCity = (city && uf) ? `${city} - ${uf}` : (city || uf || '');
            const street = row['Endereço'] || row['Endereco'] || row['address'] || '';
            const neighborhood = row['Bairro'] || row['bairro'] || '';
            const cep = row['CEP'] || row['cep'] || '';
            
            let fullAddress = street;
            if (neighborhood) fullAddress += fullAddress ? `, Bairro: ${neighborhood}` : neighborhood;
            if (cep) fullAddress += fullAddress ? `, CEP: ${cep}` : `CEP: ${cep}`;

            const customId = row['Código do Cliente'] || row['Codigo do Cliente'] || (Date.now() + Math.floor(Math.random() * 10000));

            return {
                id: customId,
                name: String(name).trim(),
                city: String(fullCity).trim(),
                address: String(fullAddress).trim(),
                phone: String(phone).trim()
            };
        }).filter(c => c.name !== '');

        await Client.insertMany(clientsToInsert);
        res.json({ success: true, count: clientsToInsert.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Erro ao processar Excel' });
    }
});

// --- RASTREAMENTO E VISITAS ---
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