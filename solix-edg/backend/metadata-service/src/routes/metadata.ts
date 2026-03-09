import { Router } from 'express';
import axios from 'axios';

const router = Router();

// OpenMetadata base URL
const OM_BASE_URL = process.env.OPENMETADATA_URL || 'http://localhost:8585/api/v1';

// GET /api/catalog/assets
router.get('/assets', async (req, res) => {
  try {
    const response = await axios.get(`${OM_BASE_URL}/tables`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// GET /api/catalog/assets/{id}
router.get('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(`${OM_BASE_URL}/tables/${id}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// GET /api/lineage/{assetId}
router.get('/lineage/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    const response = await axios.get(`${OM_BASE_URL}/lineage/table/${assetId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lineage' });
  }
});

// POST /api/catalog/update-description
router.post('/update-description', async (req, res) => {
  try {
    const { id, description } = req.body;
    const response = await axios.patch(`${OM_BASE_URL}/tables/${id}`, {
      description
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update description' });
  }
});

export { router as metadataRoutes };