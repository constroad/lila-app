import pdfGenerator from '../../pdf/generator.service';
import { HTTP_STATUS } from '../../config/constants';
export async function generatePDF(req, res, next) {
    try {
        const { templateId, data, filename } = req.body;
        if (!templateId || !data) {
            const error = new Error('templateId and data are required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        const filepath = await pdfGenerator.generatePDF({
            templateId,
            data,
            filename,
        });
        res.status(HTTP_STATUS.CREATED).json({
            success: true,
            data: {
                filepath,
                filename: filename || `pdf-${Date.now()}.pdf`,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
export async function createTemplate(req, res, next) {
    try {
        const { id, name, htmlContent } = req.body;
        if (!id || !name || !htmlContent) {
            const error = new Error('id, name, and htmlContent are required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        await pdfGenerator.createTemplate(id, name, htmlContent);
        res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: `Template ${id} created`,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function listTemplates(req, res, next) {
    try {
        const templates = await pdfGenerator.listTemplates();
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: templates.length,
                templates,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
export async function deleteTemplate(req, res, next) {
    try {
        const { templateId } = req.params;
        if (!templateId) {
            const error = new Error('templateId is required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        await pdfGenerator.deleteTemplate(templateId);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Template ${templateId} deleted`,
        });
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=pdf.controller.js.map