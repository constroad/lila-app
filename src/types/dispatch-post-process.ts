export interface DispatchPostProcessInput {
  dispatchId: string;
  companyId: string;
  orderId?: string;
  clientId?: string;
  state: string;
  dispatchFinished: boolean;
  allDispatched: boolean;
  pendingCount: number;
  dispatchedCount: number;
  clientPendingCount: number;
  clientDispatchedCount: number;
  truckDispatched?: boolean;
  note?: string;
  quantity?: number;
  plate?: string;
  driverName?: string;
  driverLicense?: string;
  driverPhoneNumber?: string;
  obra?: string;
  sender: string;
  plantGroupTarget: string;
  clientTargets: string[];
  sendDispatchMessage: boolean;
  adminGroupTarget?: string;
  ippReportUnavailableReason?: string;
  ippReportPayload?: {
    type: string;
    serviceManagementId?: string;
    companyId: string;
    schemaData: Record<string, unknown>;
    schemaOverrides?: Record<string, unknown>;
    customSections?: unknown[];
    annexes?: unknown[];
    folioConfig?: unknown;
  };
  orderCompletion?: {
    clientName: string;
    date: string;
    locationUrl: string;
    obra: string;
    orderId?: string;
    rows: Array<{
      date: string;
      driverName: string;
      hour: string;
      note: string;
      plate: string;
      quantity: number;
    }>;
    totalM3: number;
    totalUnits: number;
  };
}

export interface DispatchPostProcessContext {
  companyBotLabel: string;
  /** Grupo de PLANTA configurado por la company (vacío = no enviar a WhatsApp). */
  plantGroupId: string;
  /** Grupo admin configurado (fallback del mensaje al cliente; de-hardcodea CONSTROAD). */
  adminGroupId: string;
  /** Plantillas editables (customMessage del registry) de los avisos de planta. */
  plantProgressTemplate?: string;
  plantEndTemplate?: string;
}
