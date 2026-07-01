import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/environment.js';
import { getCompanyModel } from '../database/models.js';
import pdfGenerator from '../pdf/generator.service.js';

export type PlantSettlementPdfGroup = {
  groupId: string;
  clientName: string;
  projectName: string;
  orderDate?: string;
  dueDate?: string;
  paymentStatus: 'pending' | 'paid';
  dispatchCount: number;
  unfinishedDispatchCount: number;
  confirmedM3: number;
  pendingM3: number;
};

export type PlantSettlementPdfPayload = {
  plant: { plantId: string; name: string };
  period: { startDate: string; endDate: string };
  groups: PlantSettlementPdfGroup[];
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDate = (value?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
};

const formatM3 = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : '0.00';

const absoluteLogoUrl = (source: unknown): string => {
  const value = String(source || '').trim();
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  return `${config.portal.baseUrl.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
};

const buildReportCode = (companyId: string, payload: PlantSettlementPdfPayload): string => {
  const period = payload.period.endDate.replaceAll('-', '');
  const plant = payload.plant.plantId.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  return `RPP-${period}-${companyId.slice(0, 8).toUpperCase()}-${plant || 'PLANTA'}`;
};

export const renderPlantSettlementHtml = (params: {
  companyId: string;
  companyName: string;
  logoUrl?: string;
  payload: PlantSettlementPdfPayload;
}): string => {
  const { payload } = params;
  const confirmedTotal = payload.groups.reduce((sum, group) => sum + group.confirmedM3, 0);
  const pendingTotal = payload.groups.reduce((sum, group) => sum + group.pendingM3, 0);
  const dispatchTotal = payload.groups.reduce((sum, group) => sum + group.dispatchCount, 0);
  const unfinishedTotal = payload.groups.reduce(
    (sum, group) => sum + group.unfinishedDispatchCount,
    0
  );
  const rows = payload.groups.map((group) => `
    <tr>
      <td>${escapeHtml(group.projectName || 'Sin obra')}</td>
      <td>${escapeHtml(group.clientName)}</td>
      <td>${formatDate(group.orderDate)}</td>
      <td>${formatDate(group.dueDate)}</td>
      <td>${group.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}</td>
      <td class="number">${group.dispatchCount}</td>
      <td class="number">${group.unfinishedDispatchCount}</td>
      <td class="number">${formatM3(group.confirmedM3)}</td>
      <td class="number">${formatM3(group.pendingM3)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 9px; }
  header { display: grid; grid-template-columns: 42mm 1fr 58mm; border: 1px solid #111827; }
  header > div { padding: 7px; border-right: 1px solid #111827; }
  header > div:last-child { border-right: 0; }
  .logo { max-width: 36mm; max-height: 18mm; object-fit: contain; }
  h1 { font-size: 16px; margin: 2px 0 5px; text-align: center; }
  .center { text-align: center; } .meta { line-height: 1.55; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .metric { border: 1px solid #cbd5e1; border-radius: 5px; padding: 7px; }
  .metric strong { display: block; font-size: 15px; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #94a3b8; padding: 5px; }
  th { background: #e2e8f0; font-size: 8px; text-transform: uppercase; }
  .number { text-align: right; }
  tfoot td { background: #f1f5f9; font-weight: bold; }
</style></head><body>
  <header>
    <div class="center">${params.logoUrl
      ? `<img class="logo" src="${escapeHtml(absoluteLogoUrl(params.logoUrl))}" alt="Logo">`
      : `<strong>${escapeHtml(params.companyName)}</strong>`}</div>
    <div><h1>REPORTE DE PRODUCCIÓN POR PLANTA</h1>
      <div class="center"><strong>${escapeHtml(payload.plant.name)}</strong></div></div>
    <div class="meta"><strong>Código:</strong> ${buildReportCode(params.companyId, payload)}<br>
      <strong>Desde:</strong> ${formatDate(payload.period.startDate)}<br>
      <strong>Hasta:</strong> ${formatDate(payload.period.endDate)}</div>
  </header>
  <section class="summary">
    <div class="metric">M3 confirmados<strong>${formatM3(confirmedTotal)} m3</strong></div>
    <div class="metric">M3 por revisar<strong>${formatM3(pendingTotal)} m3</strong></div>
    <div class="metric">Despachos<strong>${dispatchTotal}</strong></div>
    <div class="metric">No finalizados<strong>${unfinishedTotal}</strong></div>
  </section>
  <table><thead><tr><th>Obra</th><th>Cliente</th><th>Fecha</th><th>Vence</th>
    <th>Pago</th><th>Despachos</th><th>No finalizados</th><th>M3 confirmado</th>
    <th>M3 revisar</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="5">TOTAL GENERAL</td><td class="number">${dispatchTotal}</td>
      <td class="number">${unfinishedTotal}</td><td class="number">${formatM3(confirmedTotal)}</td>
      <td class="number">${formatM3(pendingTotal)}</td></tr></tfoot>
  </table>
</body></html>`;
};

export async function generatePlantSettlementPdf(params: {
  companyId: string;
  payload: PlantSettlementPdfPayload;
}): Promise<{ filePath: string; fileName: string }> {
  if (
    !params.payload?.plant?.plantId
    || !params.payload?.period?.startDate
    || !params.payload?.period?.endDate
    || !Array.isArray(params.payload.groups)
  ) {
    throw new Error('El informe de producción es inválido.');
  }
  if (!params.payload.groups.length) throw new Error('El informe no contiene pedidos.');
  const Company = await getCompanyModel();
  const company = await Company.findOne({ companyId: params.companyId })
    .select('companyId name branding')
    .lean();
  if (!company) throw new Error('Empresa no encontrada.');
  const html = renderPlantSettlementHtml({
    companyId: params.companyId,
    companyName: String(company.name || params.companyId),
    logoUrl: company.branding?.logoLight || company.branding?.logoDark,
    payload: params.payload,
  });
  await fs.ensureDir(config.pdf.tempDir);
  const fileName = `reporte-produccion-${Date.now()}.pdf`;
  const filePath = path.join(config.pdf.tempDir, fileName);
  await pdfGenerator.generateFromHtml(html, {
    outputPath: filePath,
    format: 'A4',
    landscape: true,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  });
  return { filePath, fileName };
}
