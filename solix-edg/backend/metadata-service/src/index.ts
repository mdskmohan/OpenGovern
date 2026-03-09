import express from 'express';
import dotenv from 'dotenv';
import { metadataRoutes } from './routes/metadata';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.use('/api/catalog', metadataRoutes);

app.listen(port, () => {
  console.log(`Metadata service listening on port ${port}`);
});