# Desarrollo local seguro

Antes de iniciar lila-app localmente:

```bash
cp .env.development.example .env.development
```

El archivo `.env` base debe contener:

```env
NODE_ENV=development
```

Con `NODE_ENV=development`, lila-app:

- no restaura sesiones WhatsApp persistidas en Mongo;
- no programa cronjobs automáticos;
- sigue permitiendo ejecutar un cronjob manualmente.

Al arrancar deben aparecer los avisos:

```text
WhatsApp session auto-restore DISABLED
LOS CRONJOBS AUTOMÁTICOS NO SE EJECUTARÁN EN ESTA INSTANCIA
```

Si se restauran sesiones, detener inmediatamente la instancia local. Nunca usar
`WHATSAPP_RESTORE_SESSIONS=true` apuntando al Mongo de producción mientras
producción esté activa. Para probar WhatsApp, usar otro número o una base de datos
separada.
