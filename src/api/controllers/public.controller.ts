import { Request, Response } from 'express';
import { getCompanyModel } from '../../database/models.js';

type CompanyLoginData = {
  companyId: string;
  slug: string;
  name: string;
  isActive: boolean;
  branding?: {
    logoLight?: string;
    logoDark?: string;
    favicon?: string;
  };
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const companyLoginCache = new Map<string, { expiresAt: number; data: CompanyLoginData | null }>();

const normalizeSlug = (value: unknown): string => String(value || '').trim().toLowerCase();

const isValidSlug = (slug: string): boolean => /^[a-z0-9-]+$/.test(slug);

const setPublicCacheHeaders = (res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
};

export async function getCompanyLogin(req: Request, res: Response) {
  try {
    const slug = normalizeSlug(req.query.slug);

    if (!slug || !isValidSlug(slug)) {
      return res.status(400).json({
        ok: false,
        message: 'slug invalido',
      });
    }

    const cached = companyLoginCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      setPublicCacheHeaders(res);
      if (!cached.data) {
        return res.status(404).json({ ok: false, message: 'Empresa no encontrada' });
      }
      return res.status(200).json({ ok: true, data: cached.data });
    }

    const Company = await getCompanyModel();
    const company = await Company.findOne(
      { slug },
      {
        companyId: 1,
        slug: 1,
        name: 1,
        isActive: 1,
        'branding.logoLight': 1,
        'branding.logoDark': 1,
        'branding.favicon': 1,
      }
    ).lean();

    if (!company || company.isActive === false) {
      companyLoginCache.set(slug, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: null,
      });
      setPublicCacheHeaders(res);
      return res.status(404).json({ ok: false, message: 'Empresa no encontrada' });
    }

    const data: CompanyLoginData = {
      companyId: company.companyId,
      slug: company.slug || slug,
      name: company.name,
      isActive: company.isActive !== false,
      branding: company.branding || undefined,
    };

    companyLoginCache.set(slug, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
    });

    setPublicCacheHeaders(res);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error('[public] company-login error', error);
    return res.status(500).json({
      ok: false,
      message: 'Error consultando empresa',
    });
  }
}
