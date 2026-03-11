import { Request, Response } from 'express';
import * as searchService from '../services/search.service';

function handleError(res: Response, err: unknown): void {
  console.error('[SearchController]', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Search failed' },
  });
}

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const q = (req.query.q as string) ?? '';
    const from = Math.max(0, parseInt(req.query.from as string || '0', 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size as string || '20', 10)));

    const filters = {
      type: req.query.type as string | undefined,
      platform: req.query.platform as string | undefined,
      domain: req.query.domain as string | undefined,
      sensitivity: req.query.sensitivity as string | undefined,
      certificationStatus: req.query.certification_status as string | undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
    };

    const { results, total } = await searchService.search(q, filters, from, size);

    const data = results.map((r) => ({
      urn: r.urn,
      name: r.name,
      entity_type: r.entityType,
      platform: r.platform,
      description: r.description,
      quality_score: r.qualityScore,
      certification_status: r.certificationStatus,
      sensitivity: r.sensitivity,
      domain_name: r.domainName,
      tags: r.tags,
      highlights: r.highlights,
      score: r.score,
    }));

    res.json({
      success: true,
      data: {
        results: data,
        total,
        from,
        size,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
}
