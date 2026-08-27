const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });

app.post('/api/clients/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const importedClients = rawData.map(item => ({
      id: item['Código do Cliente'] || Date.now(),
      name: item['Razão Social'] || 'Sem Nome',
      city: item['Cidade'] || 'Não informada',
      region: item['Bairro'] || 'Geral',
      phone: item['Fone Resid'] ? String(item['Fone Resid']) : 'Não informado',
      address: item['Endereço'] || ''
    }));

    clients = importedClients;
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
    fs.unlinkSync(req.file.path);

    res.json({ message: 'Base de clientes atualizada com sucesso', total: clients.length });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar arquivo Excel' });
  }
});