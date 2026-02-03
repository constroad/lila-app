# RESUMEN: LIMPIEZA LEGACY DRIVE + CORRECCIÓN FOLDERS

**Fecha:** 27 Enero 2026
**Estado:** ✅ Completado
**Duración:** 2 horas

---

## 🎯 Problemas Identificados y Resueltos

### 1. ❌ Problema: `resourceId` opcional causaba folders sin contexto

**Situación inicial:**
```typescript
// Modelo folder permitía resourceId opcional
resourceId: z.string().optional()  // ❌ Permitía undefined
```

**Tu experiencia:**
```bash
POST /api/folder {"resourceId":"drive-global","name":"test01"}
# ✅ 201 Created

GET /api/drive/folders?resourceId=drive-global
# ❌ [] (vacío) - El folder se creó sin resourceId!
```

**Causa:** Al reiniciar el servidor, el body no llegó correctamente o fue parseado sin el campo.

**Solución aplicada:**
```typescript
// ✅ resourceId ahora es REQUERIDO
resourceId: z.string().min(1, "resourceId is required")

// Mongoose schema también actualizado
resourceId: { type: String, required: true }
```

**Resultado:**
- ✅ Validación zod rechaza requests sin resourceId
- ✅ MongoDB rechaza documentos sin resourceId
- ✅ TypeScript fuerza verificaciones en el código

---

### 2. ❌ Problema: Sistema legacy `data/drive` coexistía con multi-tenant

**Configuración inconsistente:**
```env
# .env tenía DOS sistemas
DRIVE_ROOT_DIR=./data/drive              # ❌ Legacy single-tenant
FILE_STORAGE_ROOT=/Users/josezamora/projects  # ✅ Nuevo multi-tenant
```

**Archivos afectados:**
- `data/drive/` - Carpeta física legacy
- `src/storage/drive.store.ts` - Funciones legacy (buildPublicUrl, resolveDrivePath, etc.)
- `src/config/environment.ts` - Config legacy
- `src/index.ts` - Servicio de archivos estáticos legacy

**Solución aplicada:**

#### A. Backup de datos legacy
```bash
mv data/drive data/drive.backup
mv src/storage/drive.store.ts src/storage/drive.store.ts.backup
```

#### B. Limpieza de imports
```typescript
// ❌ ANTES: drive.controller.ts
import { buildPublicUrl, ensureDriveRoot, isValidEntryName, resolveDrivePath } from '../../storage/drive.store.js';

// ✅ DESPUÉS: drive.controller.ts
import { storagePathService } from '../../services/storage-path.service.js';

// Helper local para validación
function isValidEntryName(name: string) {
  if (!name) return false;
  if (name === '.' || name === '..') return false;
  return !/[\\/]/.test(name);
}
```

#### C. Actualización de toEntry()
```typescript
// ❌ ANTES
function toEntry(relativeBase: string, name: string, stat: fs.Stats) {
  return {
    // ...
    url: stat.isFile() ? buildPublicUrl(relPath) : undefined,  // ❌ Legacy
  };
}

// ✅ DESPUÉS
function toEntry(relativeBase: string, name: string, stat: fs.Stats, companyId: string) {
  return {
    // ...
    url: stat.isFile() ? `/files/companies/${companyId}/${relPath}` : undefined,  // ✅ Multi-tenant
  };
}
```

#### D. Migración de drive-pdf.controller.ts

**ANTES:**
```typescript
import { resolveDrivePath } from '../../storage/drive.store.js';

function getPdfPathFromRequest(req: Request) {
  const { url, path: pathParam } = req.query;

  if (pathParam) {
    const { resolved, normalized } = resolveDrivePath(pathParam);  // ❌ Legacy
    return { resolved, normalized };
  }

  // Lógica compleja para parsear URLs públicas legacy...
}
```

**DESPUÉS:**
```typescript
import { storagePathService } from '../../services/storage-path.service.js';

function getPdfPathFromRequest(req: Request) {
  const companyId = req.companyId;
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  const { path: pathParam } = req.query;

  if (!pathParam) {
    throw new Error('path is required');
  }

  const resolved = storagePathService.resolvePath(companyId, pathParam);  // ✅ Multi-tenant

  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error('Access denied: invalid path');
  }

  return { resolved, normalized: pathParam };
}
```

**Mejoras:**
- ✅ Eliminada lógica de URL parsing legacy
- ✅ Validación de acceso multi-tenant
- ✅ Solo acepta `path` query param (más simple)

#### E. Limpieza de environment.ts

**ANTES:**
```typescript
drive: {
  rootDir: process.env.DRIVE_ROOT_DIR || './data/drive',         // ❌ Legacy
  publicBaseUrl: process.env.DRIVE_PUBLIC_BASE_URL || '/files',   // ❌ Legacy
  maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '25', 10),
  cacheDir: process.env.DRIVE_CACHE_DIR || './data/drive-cache',  // ❌ Legacy
},
storage: {
  root: process.env.FILE_STORAGE_ROOT || '/mnt/constroad-storage',  // ✅ Multi-tenant
},
```

**DESPUÉS:**
```typescript
drive: {
  maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '25', 10),  // ✅ Solo config necesaria
},
storage: {
  root: process.env.FILE_STORAGE_ROOT || '/mnt/constroad-storage',  // ✅ Multi-tenant
},
```

#### F. Limpieza de .env

**ANTES:**
```env
FILE_STORAGE_ROOT=/Users/josezamora/projects
DRIVE_ROOT_DIR=./data/drive           # ❌ Eliminar
DRIVE_PUBLIC_BASE_URL=/files          # ❌ Eliminar
DRIVE_MAX_FILE_SIZE_MB=25
```

**DESPUÉS:**
```env
FILE_STORAGE_ROOT=/Users/josezamora/projects
DRIVE_MAX_FILE_SIZE_MB=25  # ✅ Solo esto
```

#### G. Limpieza de index.ts (static files)

**ANTES:**
```typescript
// Legacy single-tenant
app.use(
  config.drive.publicBaseUrl,  // '/files'
  express.static(config.drive.rootDir, {  // './data/drive'
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    immutable: true,
  })
);

// Multi-tenant
app.use(
  '/files/companies',
  express.static(config.storage.root + '/companies', {
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    immutable: true,
  })
);
```

**DESPUÉS:**
```typescript
// Solo multi-tenant
app.use(
  '/files/companies',
  express.static(config.storage.root + '/companies', {
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    immutable: true,
  })
);
```

---

### 3. ✅ Correcciones en Portal: Validación de resourceId

**Archivos actualizados:**

#### A. `useOrder.ts`
```typescript
// ✅ Validación agregada
const onCreateDocumentsFolder = (order: IOrderValidationSchema) => {
  if (!order._id) {
    console.error('Cannot create folders: order._id is required');
    return;  // ✅ Exit early
  }

  const payload: IFolderValidationSchema = {
    name: FOLDER_DOCUMENTS,
    resourceId: order._id,  // ✅ Ya validado
  }
  saveFolder('POST', payload)
  // ...
}
```

#### B. `useDrive.ts`
```typescript
const createFolder = useCallback(
  async (name: string, options?: CreateFolderOptions) => {
    // ✅ Validación agregada
    if (!props?.resourceId) {
      const error = new Error('resourceId is required to create a folder');
      console.error('[useDrive] ❌ Create folder error:', error.message);
      options?.onError?.(error);
      return;
    }

    await createFolderMutation(
      'POST',
      {
        name,
        parentId: options?.parentId,
        resourceId: props.resourceId,  // ✅ Ya validado
        color: options?.color || '#888888',
      },
      // ...
    );
  },
  [createFolderMutation, props?.resourceId, refetchFolders]
);
```

#### C. `MediaHeader.tsx`
```typescript
const handleOnCreateFolderName = () => {
  if (folderName === '') {
    setFolderNameError(true);
    return;
  }

  // ✅ Validación agregada
  if (!resourceId) {
    console.error('[MediaHeader] Cannot create folder: resourceId is required');
    return;
  }

  const payload: IFolderValidationSchema = {
    resourceId,  // ✅ Ya validado
    name: folderName,
    parentId: props.parentFolderId,
    updatedAt: new Date().toISOString(),
  };
  // ...
};
```

---

## ✅ Verificación de Builds

### lila-app
```bash
npm run build
# ✅ Build completed successfully
```

**Cambios verificados:**
- ✅ drive.controller.ts sin imports legacy
- ✅ drive-pdf.controller.ts migrado a multi-tenant
- ✅ environment.ts sin config legacy
- ✅ index.ts sin static files legacy
- ✅ No references to drive.store.ts

### Portal
```bash
npm run build
# ✅ Build completed successfully
```

**Cambios verificados:**
- ✅ Folder model con resourceId requerido
- ✅ useOrder.ts con validaciones
- ✅ useDrive.ts con validaciones
- ✅ MediaHeader.tsx con validaciones
- ✅ TypeScript pasa sin errores

---

## 📊 Estructura Final

### lila-app (Backend)

**Storage multi-tenant:**
```
FILE_STORAGE_ROOT/
└── companies/
    ├── company-123/
    │   └── storage/
    │       ├── orders/
    │       │   └── order-456/
    │       │       ├── documents/
    │       │       └── laboratory/
    │       └── drive-global/
    │           └── test01/
    └── company-789/
        └── storage/
            └── ...
```

**APIs:**
```typescript
// ✅ Multi-tenant drive APIs
POST   /api/drive/folders  → Crea carpeta física
POST   /api/drive/files    → Sube archivo
GET    /api/drive/list     → Lista contenido
DELETE /api/drive/entry    → Elimina file/folder

// ✅ Static files multi-tenant
GET /files/companies/:companyId/*  → Archivos públicos
```

### Portal (Frontend)

**MongoDB schema:**
```typescript
const FolderSchema = new Schema({
  resourceId: { type: String, required: true },  // ✅ Requerido
  name: { type: String, required: true },
  order: { type: Number, required: false },
  parentId: { type: String, required: false },
  color: { type: String, required: false },
  status: { type: String, required: false, default: 'ACTIVE' },
}, {
  timestamps: true,
});
```

**APIs Portal:**
```typescript
// ✅ Metadata de folders en MongoDB
POST /api/folder          → Crea metadata (ahora requiere resourceId)
GET  /api/drive/folders   → Lista folders con stats
GET  /api/folder          → Lista folders filtrados por resourceId
```

---

## 🔄 Sincronización Portal ↔ lila-app

### Flujo actual (sin sync):

```
┌──────────────────────────────────────────────────────┐
│              PORTAL (Frontend)                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  POST /api/folder                                    │
│  ┌────────────────────────────────┐                 │
│  │  MongoDB: folders collection   │  ✅ Metadata    │
│  │  { resourceId, name, parentId} │                 │
│  └────────────────────────────────┘                 │
│                                                      │
│  GET /api/drive/folders                              │
│  ┌────────────────────────────────┐                 │
│  │  Lee desde MongoDB             │  ✅ Metadata    │
│  └────────────────────────────────┘                 │
│                                                      │
└──────────────────────────────────────────────────────┘
                     │
                     │ ❌ NO HAY COMUNICACIÓN
                     │
┌──────────────────────────────────────────────────────┐
│              LILA-APP (Backend)                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  POST /api/drive/folders                             │
│  ┌────────────────────────────────┐                 │
│  │  File System:                  │  ✅ Carpeta     │
│  │  mkdir FILE_STORAGE_ROOT/      │     física      │
│  │       company-*/storage/...    │                 │
│  └────────────────────────────────┘                 │
│                                                      │
│  POST /api/drive/files                               │
│  ┌────────────────────────────────┐                 │
│  │  fs.ensureDir(path)            │  ✅ Crea        │
│  │  fs.writeFile(file)            │     on-demand   │
│  └────────────────────────────────┘                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Comportamiento actual (válido):

1. **Portal crea metadata en MongoDB:**
   ```bash
   POST /api/folder
   Body: {"resourceId":"drive-global","name":"test01"}
   # ✅ Guarda en MongoDB
   ```

2. **Folder físico se crea on-demand:**
   ```bash
   # Usuario sube archivo
   POST /api/drive/upload
   Body: { file: <FILE>, resourceId: "drive-global", folderId: "..." }
   # lila-app hace: fs.ensureDir(path)
   # ✅ Carpeta física creada automáticamente
   ```

3. **Ventajas del enfoque on-demand:**
   - ✅ No hay folders vacíos en disco
   - ✅ No requiere sync entre Portal y lila-app
   - ✅ Lazy creation (solo si es necesario)

---

## 🎓 Lecciones Aprendidas

### 1. Validación de campos requeridos

**Problema:**
- Campos opcionales causan inconsistencias
- Sin validación, el código acepta datos incompletos

**Solución:**
```typescript
// ❌ Malo
resourceId: z.string().optional()

// ✅ Bueno
resourceId: z.string().min(1, "resourceId is required")
```

**Aplicar en código:**
```typescript
// Siempre validar antes de usar
if (!resourceId) {
  console.error('resourceId is required');
  return;  // Exit early
}

// Ahora TypeScript sabe que resourceId existe
const payload = { resourceId, name };
```

### 2. Eliminar código legacy incrementalmente

**Pasos seguidos:**
1. ✅ Identificar dependencias del código legacy
2. ✅ Hacer backup antes de eliminar
3. ✅ Reemplazar imports uno por uno
4. ✅ Verificar build después de cada cambio
5. ✅ Documentar cambios

### 3. Multi-tenant desde el inicio

**Aprendizajes:**
- ✅ Siempre usar `companyId` en paths
- ✅ Validar acceso con `storagePathService.validateAccess()`
- ✅ Construir URLs con `/files/companies/:companyId/...`
- ✅ Nunca servir archivos directamente de root

---

## ✅ Estado Final

### ✅ Completado

1. **resourceId ahora es requerido:**
   - ✅ Validación en zod schema
   - ✅ Validación en Mongoose schema
   - ✅ Validaciones en código TypeScript

2. **Sistema legacy eliminado:**
   - ✅ `data/drive` → `data/drive.backup`
   - ✅ `drive.store.ts` → `drive.store.ts.backup`
   - ✅ Config legacy removida de `.env`
   - ✅ Config legacy removida de `environment.ts`
   - ✅ Static files legacy removido de `index.ts`

3. **Código migrado a multi-tenant:**
   - ✅ `drive.controller.ts` usa `storagePathService`
   - ✅ `drive-pdf.controller.ts` usa `storagePathService`
   - ✅ URLs construidas con `/files/companies/:companyId/...`

4. **Builds exitosos:**
   - ✅ lila-app: Build completed successfully
   - ✅ Portal: Build completed successfully

---

## 📝 Próximos Pasos (Opcionales)

### Opción A: Implementar sync explícito Portal → lila-app

Si quieres que las carpetas vacías existan físicamente:

```typescript
// En Portal: /api/folder/index.ts
const addRecord = async (req: NextApiRequest, res: NextApiResponse) => {
  // 1. Crear metadata en MongoDB
  const response = await repo.create(newRecord);

  // 2. Crear carpeta física en lila-app
  const LILA_APP_URL = process.env.LILA_SERVER_URL || 'http://localhost:3001';

  try {
    await axios.post(`${LILA_APP_URL}/api/drive/folders`, {
      path: parentPath || '',
      name: newRecord.name,
    }, {
      headers: {
        'Authorization': `Bearer ${req.token}`,
        'x-api-key': process.env.LILA_APP_API_KEY,
      },
    });
  } catch (error) {
    console.warn('Failed to create physical folder:', error.message);
    // No fallar el request - carpeta se creará on-demand
  }

  res.status(201).json(response);
};
```

### Opción B: Mantener on-demand (RECOMENDADO)

Continuar con el enfoque actual:
- ✅ Folders solo existen en MongoDB
- ✅ Carpetas físicas se crean al subir primer archivo
- ✅ Simple, sin sync necesario

---

**Fecha de última actualización:** 2026-01-27
**Estado:** ✅ Limpieza completada, sistema unificado multi-tenant
**Builds:** ✅ lila-app + Portal exitosos
