export interface DispatchPostProcessInput {
  dispatchId: string;
  companyId: string;
  orderId?: string;
  clientId?: string;
  state: string;
  dispatchFinished: boolean;
  allDispatched: boolean;
  pendingCount: number;
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
}

export interface DispatchPostProcessContext {
  companyBotLabel: string;
}
