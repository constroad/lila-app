import JobSchedulerV2 from './scheduler.service.v2.js';
import connectionManager from '../whatsapp/baileys/connection.manager.js';

const jobSchedulerV2 = new JobSchedulerV2(connectionManager);

export default jobSchedulerV2;
