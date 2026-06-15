const express = require('express');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Webhook running');
});

app.post('/hubspot-webhook', (req, res) => {
  console.log('========== HUBSPOT WEBHOOK ==========');
  console.log(JSON.stringify(req.body, null, 2));

  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});