import axios from 'axios';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';

export async function sendClientReportAction(action: string, token: string, sourceChatId?: string) {
  const baseUrl = config.portal?.baseUrl || 'http://localhost:3000';
  const jwtSecret = config.security.jwtSecret;

  const response = await axios.post(
    `${baseUrl}/api/public/client-report/action`,
    { action, token, sourceChatId },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt.sign({ companyId: 'system' }, jwtSecret, { expiresIn: '5m' })}`,
      },
    }
  );

  return response.data;
}
