import connectionManager from '../../whatsapp/baileys/connection.manager';
import logger from '../../utils/logger';
import { HTTP_STATUS } from '../../config/constants';
export async function createSession(req, res, next) {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            const error = new Error('phoneNumber is required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        logger.info(`Creating session for ${phoneNumber}`);
        const socket = await connectionManager.createConnection(phoneNumber);
        res.status(HTTP_STATUS.CREATED).json({
            success: true,
            data: {
                phoneNumber,
                status: connectionManager.getConnectionStatus(phoneNumber),
                qr: connectionManager.getQRCode(phoneNumber),
            },
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getSessionStatus(req, res, next) {
    try {
        const { phoneNumber } = req.params;
        if (!phoneNumber) {
            const error = new Error('phoneNumber is required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        const status = connectionManager.getConnectionStatus(phoneNumber);
        const qr = connectionManager.getQRCode(phoneNumber);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                phoneNumber,
                status,
                isConnected: connectionManager.isConnected(phoneNumber),
                ...(qr && { qr }),
            },
        });
    }
    catch (error) {
        next(error);
    }
}
export async function disconnectSession(req, res, next) {
    try {
        const { phoneNumber } = req.params;
        if (!phoneNumber) {
            const error = new Error('phoneNumber is required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        await connectionManager.disconnect(phoneNumber);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Session ${phoneNumber} disconnected`,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getAllSessions(req, res, next) {
    try {
        const connections = connectionManager.getAllConnections();
        const sessions = Array.from(connections.keys()).map((phone) => ({
            phoneNumber: phone,
            status: connectionManager.getConnectionStatus(phone),
            isConnected: connectionManager.isConnected(phone),
        }));
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: sessions.length,
                sessions,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=session.controller.js.map