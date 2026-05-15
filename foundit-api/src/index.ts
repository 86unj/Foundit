import express from 'express';

const app = express();
const PORT = 3001;

app.get('/', (req, res) => {
  res.json({ message: 'API working' });
});

app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});
