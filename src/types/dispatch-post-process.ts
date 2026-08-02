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
  /**
   * "Unidad N" del PEDIDO, congelado por Portal al salir de planta. Es el numero
   * que ve el cliente y el que va impreso en su vale. `dispatchedCount` NO sirve
   * para esto: cuenta despachos por EMPRESA y dia operativo, asi que con dos
   * pedidos el mismo dia planta y cliente veian numeros distintos.
   */
  unitNumber?: number;
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
      /** "Unidad N" congelado del pedido; ordena la tabla del resumen. */
      unitNumber?: number;
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
