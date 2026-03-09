/**
 * OpenGovern Metadata Service Routes
 *
 * This module provides REST API endpoints for interacting with OpenMetadata,
 * the core metadata management engine of the OpenGovern platform.
 *
 * Key Responsibilities:
 * - Fetch metadata assets (tables, dashboards, pipelines, etc.) from OpenMetadata
 * - Retrieve detailed information about individual assets
 * - Get data lineage information for impact analysis
 * - Update asset metadata (descriptions, tags, ownership, etc.)
 *
 * Architecture:
 * - Express.js router for REST API endpoints
 * - Axios HTTP client for OpenMetadata API communication
 * - Environment-based configuration for OpenMetadata URL
 * - Comprehensive error handling and logging
 * - TypeScript for type safety and better developer experience
 *
 * Integration Points:
 * - OpenMetadata API (v1) for metadata operations
 * - Frontend catalog browser for asset discovery
 * - Lineage visualization components
 * - Policy engine for governance rule evaluation
 *
 * Security Considerations:
 * - All requests should be authenticated and authorized
 * - Input validation for all parameters
 * - Rate limiting to prevent API abuse
 * - Audit logging for metadata changes
 */

import { Router } from 'express';
import axios from 'axios';

/**
 * Express Router Instance
 *
 * Creates a new router instance for metadata-related routes.
 * This router will be mounted at /api/catalog in the main application.
 */
const router = Router();

/**
 * OpenMetadata Base URL Configuration
 *
 * Retrieves the OpenMetadata API base URL from environment variables.
 * Falls back to localhost development configuration if not set.
 *
 * Environment Variable: OPENMETADATA_URL
 * Default: http://localhost:8585/api/v1
 */
const OM_BASE_URL = process.env.OPENMETADATA_URL || 'http://localhost:8585/api/v1';

/**
 * GET /api/catalog/assets - List All Assets
 *
 * Retrieves a paginated list of all metadata assets from OpenMetadata.
 * This endpoint powers the main catalog browser in the frontend.
 *
 * Query Parameters (from OpenMetadata API):
 * - limit: Number of assets to return (default: 10)
 * - offset: Pagination offset for large result sets
 * - fields: Specific fields to include in response
 * - database: Filter by database name
 * - service: Filter by service name
 *
 * Response: OpenMetadata table list with metadata
 * Error Codes: 500 - OpenMetadata API unavailable
 */
router.get('/assets', async (req, res) => {
  try {
    // Forward request to OpenMetadata tables endpoint
    const response = await axios.get(`${OM_BASE_URL}/tables`);
    // Return OpenMetadata response directly to frontend
    res.json(response.data);
  } catch (error) {
    // Log error for debugging and monitoring
    console.error('Failed to fetch assets from OpenMetadata:', error);
    // Return standardized error response
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

/**
 * GET /api/catalog/assets/{id} - Get Asset Details
 *
 * Retrieves detailed information about a specific metadata asset.
 * Used when users click on an asset in the catalog to view full details.
 *
 * Path Parameters:
 * - id: Unique identifier of the asset (OpenMetadata table ID)
 *
 * Response: Complete asset metadata including:
 * - Schema information (columns, data types)
 * - Usage statistics and metrics
 * - Ownership and stewardship information
 * - Tags and classifications
 * - Data quality scores
 *
 * Error Codes:
 * - 404 - Asset not found
 * - 500 - OpenMetadata API error
 */
router.get('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch specific asset details from OpenMetadata
    const response = await axios.get(`${OM_BASE_URL}/tables/${id}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Failed to fetch asset ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

/**
 * GET /api/lineage/{assetId} - Get Asset Lineage
 *
 * Retrieves data lineage information for a specific asset.
 * Shows upstream and downstream dependencies for impact analysis.
 *
 * Path Parameters:
 * - assetId: Unique identifier of the asset
 *
 * Query Parameters:
 * - upstreamDepth: How many levels upstream to traverse (default: 1)
 * - downstreamDepth: How many levels downstream to traverse (default: 1)
 *
 * Response: Lineage graph with nodes and edges representing:
 * - Source systems and tables
 * - Transformation pipelines
 * - Target systems and reports
 * - Data flow relationships
 *
 * Use Cases:
 * - Impact analysis for schema changes
 * - Data governance compliance
 * - Root cause analysis for data issues
 */
router.get('/lineage/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    // Fetch lineage data from OpenMetadata
    const response = await axios.get(`${OM_BASE_URL}/lineage/table/${assetId}`);
    res.json(response.data);
  } catch (error) {
    console.error(`Failed to fetch lineage for asset ${req.params.assetId}:`, error);
    res.status(500).json({ error: 'Failed to fetch lineage' });
  }
});

/**
 * POST /api/catalog/update-description - Update Asset Description
 *
 * Updates the description field of a metadata asset.
 * This is a key governance operation that improves data discoverability.
 *
 * Request Body:
 * - id: Asset identifier (required)
 * - description: New description text (required)
 *
 * Response: Updated asset metadata
 *
 * Security Notes:
 * - Should validate user permissions for asset modification
 * - Changes should be audited for compliance
 * - Consider approval workflow for sensitive assets
 *
 * Error Codes:
 * - 400 - Invalid request data
 * - 403 - Insufficient permissions
 * - 404 - Asset not found
 * - 500 - Update operation failed
 */
router.post('/update-description', async (req, res) => {
  try {
    const { id, description } = req.body;

    // Input validation (should be enhanced with proper validation library)
    if (!id || !description) {
      return res.status(400).json({ error: 'Asset ID and description are required' });
    }

    // Update asset description in OpenMetadata
    const response = await axios.patch(`${OM_BASE_URL}/tables/${id}`, {
      description
    });

    res.json(response.data);
  } catch (error) {
    console.error(`Failed to update description for asset ${req.body.id}:`, error);
    res.status(500).json({ error: 'Failed to update description' });
  }
});

/**
 * Export Metadata Routes
 *
 * Exports the configured router as metadataRoutes for mounting
 * in the main Express application at the /api/catalog path.
 */
export { router as metadataRoutes };