export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'WhatsApp API v2',
    version: '1.0.0',
    description: 'API para sesiones, mensajeria, jobs y PDFs.',
  },
  servers: [
    {
      url: '/',
    },
  ],
  tags: [
    { name: 'Session', description: 'Sesiones de WhatsApp' },
    { name: 'WhatsApp', description: 'Envio de mensajes y archivos' },
    { name: 'Messages', description: 'Historial de conversaciones' },
    { name: 'Jobs', description: 'Cron jobs' },
    { name: 'PDF', description: 'Generacion de PDFs y templates' },
    { name: 'Drive', description: 'Almacenamiento local tipo drive' },
    { name: 'System', description: 'Health y estado del servidor' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Servidor activo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                    environment: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/status': {
      get: {
        tags: ['System'],
        summary: 'Estado del servidor y sesiones activas',
        responses: {
          200: {
            description: 'Estado del sistema',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        activeSessions: { type: 'number' },
                        nodeEnv: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/sessions': {
      post: {
        tags: ['Session'],
        summary: 'Crear nueva sesion WhatsApp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phoneNumber'],
                properties: {
                  phoneNumber: {
                    type: 'string',
                    description: 'Numero en formato internacional (ej. 51999999999)',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Sesion creada',
          },
          400: { description: 'Datos invalidos' },
        },
      },
      get: {
        tags: ['Session'],
        summary: 'Obtener todas las sesiones',
        responses: {
          200: { description: 'Listado de sesiones' },
        },
      },
    },
    '/api/sessions/list': {
      get: {
        tags: ['Session'],
        summary: 'Listar sesiones activas',
        responses: {
          200: {
            description: 'Listado de sesiones',
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}/qr': {
      get: {
        tags: ['Session'],
        summary: 'Obtener QR como imagen PNG',
        description: 'Usa ?format=json para recibir el QR como data URL.',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['json'] },
            description: 'Devuelve el QR como data URL en JSON',
          },
        ],
        responses: {
          200: {
            description: 'QR en PNG',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        qr: { type: 'string' },
                        qrImage: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'QR no disponible' },
        },
      },
    },
    '/api/sessions/{phoneNumber}/status': {
      get: {
        tags: ['Session'],
        summary: 'Estado de sesion WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Estado de sesion' },
          400: { description: 'Numero invalido' },
        },
      },
    },
    '/api/sessions/{phoneNumber}/logout': {
      post: {
        tags: ['Session'],
        summary: 'Cerrar sesion activa',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Sesion cerrada' },
          400: { description: 'Numero invalido' },
        },
      },
    },
    '/api/sessions/{phoneNumber}/groups': {
      get: {
        tags: ['Session'],
        summary: 'Listar grupos de WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de grupos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}/syncGroups': {
      get: {
        tags: ['Session'],
        summary: 'Sincronizar grupos de WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de grupos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}/contacts': {
      get: {
        tags: ['Session'],
        summary: 'Listar contactos de WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Listado de contactos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{phoneNumber}': {
      delete: {
        tags: ['Session'],
        summary: 'Desconectar sesion WhatsApp',
        parameters: [
          {
            name: 'phoneNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Sesion desconectada' },
          400: { description: 'Numero invalido' },
        },
      },
    },
    '/api/message': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar mensaje de texto (legacy)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionPhone', 'chatId', 'message'],
                properties: {
                  sessionPhone: { type: 'string' },
                  chatId: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mensaje enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/text': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar mensaje de texto',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'message'],
                properties: {
                  to: {
                    type: 'string',
                    description: 'Numero destino o JID (ej. 51999999999 o 51999999999@s.whatsapp.net)',
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mensaje enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/image': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar imagen',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'to'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  to: { type: 'string' },
                  caption: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Imagen enviada' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/video': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar video',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'to'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  to: { type: 'string' },
                  caption: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Video enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/file': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Enviar archivo',
        parameters: [
          {
            name: 'sessionPhone',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'to'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  to: { type: 'string' },
                  caption: { type: 'string' },
                  mimeType: {
                    type: 'string',
                    description: 'Opcional, se detecta por extension si no se envia',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Archivo enviado' },
          400: { description: 'Datos invalidos' },
        },
      },
    },
    '/api/message/{sessionPhone}/{chatId}': {
      get: {
        tags: ['Messages'],
        summary: 'Obtener conversacion',
        parameters: [
          { name: 'sessionPhone', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Conversacion' },
          404: { description: 'No encontrada' },
        },
      },
      delete: {
        tags: ['Messages'],
        summary: 'Cerrar conversacion',
        parameters: [
          { name: 'sessionPhone', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Conversacion cerrada' },
        },
      },
    },
    '/api/message/{sessionPhone}': {
      get: {
        tags: ['Messages'],
        summary: 'Listar conversaciones de sesion',
        parameters: [
          { name: 'sessionPhone', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Listado de conversaciones' },
        },
      },
    },
    '/api/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Crear cron job',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'cronExpression', 'company', 'isActive'],
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['api', 'message'] },
                  url: { type: 'string' },
                  message: {
                    type: 'object',
                    properties: {
                      sender: { type: 'string' },
                      chatId: { type: 'string' },
                      body: { type: 'string' },
                    },
                  },
                  cronExpression: { type: 'string' },
                  company: { type: 'string', enum: ['constroad', 'altavia'] },
                  isActive: { type: 'boolean' },
                  timeout: { type: 'number' },
                  retryPolicy: {
                    type: 'object',
                    properties: {
                      maxRetries: { type: 'number' },
                      backoffMultiplier: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Job creado' },
        },
      },
      get: {
        tags: ['Jobs'],
        summary: 'Listar cron jobs',
        parameters: [
          {
            name: 'company',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['constroad', 'altavia'] },
            description: 'Filtrar jobs por empresa',
          },
        ],
        responses: {
          200: { description: 'Listado de jobs' },
        },
      },
    },
    '/api/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Obtener job por ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job encontrado' },
          404: { description: 'No encontrado' },
        },
      },
      patch: {
        tags: ['Jobs'],
        summary: 'Actualizar cron job',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  url: { type: 'string' },
                  type: { type: 'string', enum: ['api', 'message'] },
                  message: {
                    type: 'object',
                    properties: {
                      sender: { type: 'string' },
                      chatId: { type: 'string' },
                      body: { type: 'string' },
                    },
                  },
                  cronExpression: { type: 'string' },
                  company: { type: 'string', enum: ['constroad', 'altavia'] },
                  isActive: { type: 'boolean' },
                  timeout: { type: 'number' },
                  retryPolicy: {
                    type: 'object',
                    properties: {
                      maxRetries: { type: 'number' },
                      backoffMultiplier: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Job actualizado' },
        },
      },
      put: {
        tags: ['Jobs'],
        summary: 'Actualizar cron job (PUT)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  url: { type: 'string' },
                  type: { type: 'string', enum: ['api', 'message'] },
                  message: {
                    type: 'object',
                    properties: {
                      sender: { type: 'string' },
                      chatId: { type: 'string' },
                      body: { type: 'string' },
                    },
                  },
                  cronExpression: { type: 'string' },
                  company: { type: 'string', enum: ['constroad', 'altavia'] },
                  isActive: { type: 'boolean' },
                  timeout: { type: 'number' },
                  retryPolicy: {
                    type: 'object',
                    properties: {
                      maxRetries: { type: 'number' },
                      backoffMultiplier: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Job actualizado' },
        },
      },
      delete: {
        tags: ['Jobs'],
        summary: 'Eliminar cron job',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job eliminado' },
        },
      },
    },
    '/api/jobs/{id}/run': {
      post: {
        tags: ['Jobs'],
        summary: 'Ejecutar job inmediatamente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Job ejecutado' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/pdf/generate': {
      post: {
        tags: ['PDF'],
        summary: 'Generar PDF desde template',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['templateId', 'data'],
                properties: {
                  templateId: { type: 'string' },
                  data: { type: 'object' },
                  filename: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'PDF generado' },
        },
      },
    },
    '/api/pdf/templates': {
      post: {
        tags: ['PDF'],
        summary: 'Crear template',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  htmlContent: { type: 'string' },
                },
                required: ['id', 'name', 'htmlContent'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Template creado' },
        },
      },
      get: {
        tags: ['PDF'],
        summary: 'Listar templates',
        responses: {
          200: { description: 'Listado de templates' },
        },
      },
    },
    '/api/pdf/templates/{templateId}': {
      delete: {
        tags: ['PDF'],
        summary: 'Eliminar template',
        parameters: [
          { name: 'templateId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Template eliminado' },
        },
      },
    },
    '/api/pdf/generate-vale': {
      post: {
        tags: ['PDF'],
        summary: 'Generar vale desde template PDF',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fields'],
                properties: {
                  template: {
                    type: 'string',
                    description: 'Nombre del template PDF en templates/pdf',
                    example: 'plantilla_dispatch_note.pdf',
                  },
                  fields: {
                    type: 'object',
                    required: [
                      'senores',
                      'obra',
                      'tipoMaterial',
                      'nroM3',
                      'placa',
                      'chofer',
                      'hora',
                      'fecha',
                    ],
                    properties: {
                      nroVale: { type: 'string' },
                      fecha: { type: 'string' },
                      senores: { type: 'string' },
                      obra: { type: 'string' },
                      tipoMaterial: { type: 'string' },
                      nroM3: { type: 'string' },
                      placa: { type: 'string' },
                      chofer: { type: 'string' },
                      hora: { type: 'string' },
                      nota: { type: 'string' },
                    },
                  },
                  coords: {
                    type: 'object',
                    description: 'Coordenadas opcionales por campo',
                  },
                  notify: {
                    type: 'object',
                    description: 'Notificaciones opcionales',
                    properties: {
                      whatsapp: {
                        type: 'object',
                        properties: {
                          from: {
                            type: 'string',
                            description: 'Session phone a usar para enviar',
                          },
                          to: {
                            type: 'string',
                            description:
                              'Numero o group id (ej. 51999999999 o 12345-67890)',
                          },
                          caption: { type: 'string' },
                        },
                      },
                      telegram: {
                        type: 'object',
                        properties: {
                          chatId: {
                            type: 'string',
                            description: 'Chat ID o username',
                          },
                          caption: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'PDF generado' },
        },
      },
    },
    '/api/pdf/templates/preview-grid': {
      get: {
        tags: ['PDF'],
        summary: 'Preview de template PDF con grilla',
        parameters: [
          {
            name: 'template',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Nombre del template PDF',
          },
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'scale',
            in: 'query',
            required: false,
            schema: { type: 'number', default: 1.5 },
          },
          {
            name: 'grid',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 50 },
          },
        ],
        responses: {
          200: {
            description: 'Imagen PNG con grilla',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/api/drive/list': {
      get: {
        tags: ['Drive'],
        summary: 'Listar archivos y carpetas',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
        ],
        responses: {
          200: { description: 'Listado de contenido' },
        },
      },
    },
    '/api/drive/info': {
      get: {
        tags: ['Drive'],
        summary: 'Obtener metadata de un archivo o carpeta',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Metadata' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/folders': {
      post: {
        tags: ['Drive'],
        summary: 'Crear carpeta',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  path: { type: 'string', description: 'Ruta padre' },
                  name: { type: 'string', description: 'Nombre de carpeta' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Carpeta creada' },
        },
      },
    },
    '/api/drive/files': {
      post: {
        tags: ['Drive'],
        summary: 'Subir archivo',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  path: { type: 'string', description: 'Ruta destino' },
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Archivo subido' },
        },
      },
    },
    '/api/drive/entry': {
      delete: {
        tags: ['Drive'],
        summary: 'Eliminar archivo o carpeta',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Eliminado' },
        },
      },
    },
    '/api/drive/move': {
      patch: {
        tags: ['Drive'],
        summary: 'Mover o renombrar archivo/carpeta',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['from', 'to'],
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Movido' },
        },
      },
    },
    '/api/drive/pdf/info': {
      get: {
        tags: ['Drive'],
        summary: 'Obtener metadata de un PDF',
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'URL publica del PDF',
          },
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
        ],
        responses: {
          200: { description: 'Metadata del PDF' },
          400: { description: 'Parametro invalido' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/pdf/page': {
      get: {
        tags: ['Drive'],
        summary: 'Renderizar pagina de PDF a imagen',
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'URL publica del PDF',
          },
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'scale',
            in: 'query',
            required: false,
            schema: { type: 'number', default: 1.5 },
            description: 'Escala de render (0.5 - 3)',
          },
        ],
        responses: {
          200: {
            description: 'Imagen PNG de la pagina',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          400: { description: 'Parametro invalido' },
          404: { description: 'No encontrado' },
        },
      },
    },
    '/api/drive/pdf/preview-grid': {
      get: {
        tags: ['Drive'],
        summary: 'Preview de PDF con grilla para coordenadas',
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'URL publica del PDF',
          },
          {
            name: 'path',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Ruta relativa dentro del drive',
          },
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'scale',
            in: 'query',
            required: false,
            schema: { type: 'number', default: 1.5 },
          },
          {
            name: 'grid',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 50 },
            description: 'Tamaño de grilla en puntos',
          },
        ],
        responses: {
          200: {
            description: 'Imagen PNG con grilla',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
  },
};
