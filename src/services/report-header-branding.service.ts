import logger from '../utils/logger.js';
import { getCompanyModel } from '../database/models.js';

/**
 * El logo de la empresa en el encabezado de un informe.
 *
 * El renderer por schema pinta `header.logoUrl` y nada más, y el `schemaData`
 * de un informe de campo NUNCA trae esa clave: el logo lo pone la empresa, no
 * quien llena el parte. Resultado: cada vez que el PDF cae al renderer —porque
 * el `printUrl` del canvas no se pudo usar— el informe sale con el recuadro del
 * logo VACÍO. Le pasó al fresado y al levantamiento de observaciones
 * (José, 09/09/2026), y ya había pasado antes con el control de pista.
 *
 * Es exactamente el puente que el vale de despacho ya hacía por su cuenta
 * (`dispatch-note-document.service`); acá vive para TODOS los informes.
 *
 * Nunca rompe: si la company no se puede leer, el PDF sale igual, sin logo.
 */

export interface CompanyBrandingDoc {
  name?: string;
  branding?: Record<string, string | undefined>;
}

export type CompanyBrandingLoader = (companyId: string) => Promise<CompanyBrandingDoc | null>;

const loadCompany: CompanyBrandingLoader = async (companyId) => {
  const CompanyModel = await getCompanyModel();
  return (await CompanyModel.findOne({ companyId })
    .select({ name: 1, branding: 1 })
    .lean()) as CompanyBrandingDoc | null;
};

const isBlank = (value: unknown): boolean => !String(value ?? '').trim();

/** El logo vigente de la empresa, en el orden en que el portal lo resuelve. */
export const companyLogoOf = (company: CompanyBrandingDoc | null | undefined): string =>
  company?.branding?.logoLight ||
  company?.branding?.logoDark ||
  company?.branding?.favicon ||
  '';

/**
 * Siembra logo y nombre en `data.header` SOLO si faltan. Un informe que ya
 * trae su propio logo (membrete de un tercero, por ejemplo) manda.
 */
export const seedReportHeaderBranding = async (
  data: Record<string, any>,
  companyId: string,
  load: CompanyBrandingLoader = loadCompany
): Promise<void> => {
  if (!data || !companyId) return;
  const header = (data.header ?? {}) as Record<string, unknown>;
  const faltaLogo = isBlank(header.logoUrl);
  const faltaNombre = isBlank(header.companyName);
  if (!faltaLogo && !faltaNombre) return;

  try {
    const company = await load(companyId);
    if (!company) return;
    if (faltaLogo) {
      const logo = companyLogoOf(company);
      if (logo) header.logoUrl = logo;
    }
    if (faltaNombre && company.name) header.companyName = company.name;
    data.header = header;
  } catch (error) {
    logger.warn('reportHeaderBranding: no se pudo leer la company', {
      companyId,
      error: String(error),
    });
  }
};
