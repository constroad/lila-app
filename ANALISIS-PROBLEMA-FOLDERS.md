# ANÁLISIS: PROBLEMA CON FOLDERS Y DRIVE

**Fecha:** 27 Enero 2026
**Reportado por:** Usuario
**Estado:** 🔴 Problema identificado

---

## 🐛 Problemas Reportados

### 1. **Inconsistencia: `data/drive` sigue existiendo**

**Problema:**
```bash
ls -la data/
# Muestra: data/drive, data/drive-cache
```

**Configuración en .env:**
```env
DRIVE_ROOT_DIR=./data/drive          # ❌ LEGACY - Single tenant
FILE_STORAGE_ROOT=/Users/josezamora/projects  # ✅ NUEVO - Multi-tenant
```

**Conclusión:** Hay DOS sistemas de storage coexistiendo:
- **Legacy:** `./data/drive` (usado por APIs antiguas)
- **Nuevo:** `FILE_STORAGE_ROOT/company-*/storage/` (multi-tenant)

---

### 2. **Folders no aparecen después de crearlos**

**Flujo del usuario:**
```bash
# 1. Crear folder en MongoDB
POST http://localhost:3000/api/folder
Body: {"resourceId": "drive-global", "name": "test01"}
# ✅ Response 201: Folder creado en MongoDB

# 2. Buscar folders
GET http://localhost:3000/api/drive/folders?resourceId=drive-global&includeStats=true
# ❌ Response: [] (vacío)
```

**¿Por qué sucede esto?**

---

## 🔍 Análisis Profundo

### Arquitectura Actual (2 Capas Desincronizadas)

#### **Capa 1: Metadata Layer (MongoDB en Portal)**

**API:** `POST /api/folder`
**Archivo:** `/Users/josezamora/projects/Portal/src/pages/api/folder/index.ts`

```typescript
const addRecord = async (req: NextApiRequest, res: NextApiResponse) => {
  const newRecord = req.body as FolderModel
  const repo = new FolderRepositoryMultiTenant(req.tenantConnection!);
  const response = await repo.create(newRecord);  // ✅ Guarda en MongoDB
  res.status(201).json(response);
}
```

**¿Qué hace?**
- ✅ Crea documento en MongoDB (collection `folders` del tenant)
- ✅ Guarda metadata: `name`, `resourceId`, `parentId`, `color`, `order`, `status`
- ❌ **NO crea carpeta física en file system**

---

**API:** `GET /api/drive/folders`
**Archivo:** `/Users/josezamora/projects/Portal/src/pages/api/drive/folders.ts`

```typescript
const getFoldersHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const folderRepo = new FolderRepositoryMultiTenant(req.tenantConnection!);
  const filter: any = { status: { $ne: 'DELETED' } };

  if (resourceId) {
    filter.resourceId = resourceId;  // 👈 AQUÍ ESTÁ EL FILTRO
  }

  const folders = await folderRepo.getAll(filter);  // Lee desde MongoDB
  return res.status(200).json(folders);
}
```

**¿Qué hace?**
- ✅ Lee folders desde MongoDB
- ✅ Filtra por `resourceId`
- ✅ Calcula stats (fileCount, totalSize) desde collection `medias`

---

#### **Capa 2: File Storage Layer (File system en lila-app)**

**API:** `POST /api/drive/files`
**Archivo:** `/Users/josezamora/projects/lila-app/src/api/controllers/drive.controller.ts`

```typescript
export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  const companyId = req.companyId;
  const { path: parentPath } = req.body;
  const file = req.file;

  const relativePath = parentPath || '';
  const resolved = storagePathService.resolvePath(companyId, relativePath);

  await fs.ensureDir(resolved);  // 👈 CREA CARPETA SI NO EXISTE

  const target = path.join(resolved, file.originalname);
  await fs.writeFile(target, file.buffer);

  await incrementStorageUsage(companyId, file.size);
}
```

**¿Qué hace?**
- ✅ Crea carpetas físicas on-demand con `fs.ensureDir`
- ✅ Guarda archivos en `FILE_STORAGE_ROOT/company-*/storage/`
- ✅ Incrementa contador de storage en MongoDB
- ❌ **NO guarda metadata de folders en MongoDB**

---

**API:** `POST /api/drive/folders`
**Archivo:** `/Users/josezamora/projects/lila-app/src/api/controllers/drive.controller.ts`

```typescript
export async function createFolder(req: Request, res: Response, next: NextFunction) {
  const companyId = req.companyId;
  const { path: parentPath, name } = req.body;

  const relativePath = parentPath || '';
  const resolved = storagePathService.resolvePath(companyId, relativePath);

  const target = path.join(resolved, name);
  await fs.ensureDir(target);  // 👈 CREA CARPETA FÍSICA

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: { name, path: newPath, type: 'folder' }
  });
}
```

**¿Qué hace?**
- ✅ Crea carpeta física en file system
- ❌ **NO guarda metadata en MongoDB**

---

### 🔴 EL PROBLEMA PRINCIPAL

**Los dos sistemas NO están sincronizados:**

```
┌─────────────────────────────────────────────────────────────┐
│                     PORTAL (Frontend)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POST /api/folder                                           │
│  ┌────────────────────────────────────┐                    │
│  │  MongoDB: folders collection       │  ✅ Metadata       │
│  │  { name, resourceId, parentId }    │                    │
│  └────────────────────────────────────┘                    │
│                     │                                       │
│                     │                                       │
│  GET /api/drive/folders                                     │
│  ┌────────────────────────────────────┐                    │
│  │  Lee desde MongoDB                 │  ✅ Lee metadata   │
│  │  Retorna folders                   │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ ❌ NO HAY COMUNICACIÓN
                          │
┌─────────────────────────────────────────────────────────────┐
│                  LILA-APP (File Storage)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POST /api/drive/folders                                    │
│  ┌────────────────────────────────────┐                    │
│  │  File System:                      │  ✅ Carpeta física │
│  │  mkdir FILE_STORAGE_ROOT/          │                    │
│  │       company-*/storage/folder/    │                    │
│  └────────────────────────────────────┘                    │
│                     │                                       │
│                     │                                       │
│  POST /api/drive/files                                      │
│  ┌────────────────────────────────────┐                    │
│  │  fs.ensureDir(path)                │  ✅ Crea on-demand │
│  │  fs.writeFile(file)                │                    │
│  └────────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 ¿Por qué no devuelve folders?

Cuando el usuario hace:

```bash
GET http://localhost:3000/api/drive/folders?resourceId=drive-global
```

**El código hace:**
```typescript
const filter: any = { status: { $ne: 'DELETED' } };
if (resourceId) {
  filter.resourceId = resourceId;  // filter.resourceId = "drive-global"
}
const folders = await folderRepo.getAll(filter);
```

**Resultado esperado:** Debería encontrar el folder con `resourceId=drive-global`

**Posibles causas de [] vacío:**

1. ✅ **El folder SÍ se creó en MongoDB** (recibió 201)
2. ❓ **Problema con el filtro:** ¿El folder tiene exactamente `resourceId="drive-global"`?
3. ❓ **Problema con status:** ¿El folder tiene `status != "DELETED"`?
4. ❓ **Problema con tenant:** ¿Se está buscando en el tenant correcto?

---

## 🔧 Verificación Necesaria

### 1. Verificar que el folder existe en MongoDB

```bash
# En MongoDB shell o Compass
use company_<COMPANY_ID>  # Tu tenant DB

db.folders.find({ resourceId: "drive-global" }).pretty()
```

**Esperado:**
```json
{
  "_id": ObjectId("..."),
  "name": "test01",
  "resourceId": "drive-global",
  "status": "ACTIVE",
  "createdAt": "2026-01-27...",
  "updatedAt": "2026-01-27..."
}
```

### 2. Verificar logs de creación

**En Portal logs:**
```
[API] POST /api/folder - companyId: company-XXX
[API] Folder created for company-XXX: <FOLDER_ID>
```

### 3. Verificar logs de búsqueda

**En Portal logs:**
```
[API] GET /api/drive/folders - companyId: company-XXX
[API] Found X folders for company-XXX
```

---

## ✅ SOLUCIONES

### Opción A: Portal debe llamar a lila-app cuando crea folders

**Problema:** Portal solo crea metadata en MongoDB, no carpeta física

**Solución:** Cuando Portal crea un folder, también debe crear la carpeta física en lila-app

```typescript
// En Portal: /src/pages/api/folder/index.ts

const addRecord = async (req: NextApiRequest, res: NextApiResponse) => {
  const newRecord = req.body as FolderModel
  const repo = new FolderRepositoryMultiTenant(req.tenantConnection!);

  // 1. Crear metadata en MongoDB
  const response = await repo.create(newRecord);

  // 2. Crear carpeta física en lila-app
  const LILA_APP_URL = process.env.LILA_SERVER_URL || 'http://localhost:3001';
  const folderPath = `${newRecord.resourceId}/${newRecord.name}`;

  try {
    await axios.post(`${LILA_APP_URL}/api/drive/folders`, {
      path: newRecord.parentId ? `${parentPath}` : '',
      name: newRecord.name,
    }, {
      headers: {
        'Authorization': `Bearer ${req.token}`,  // JWT con companyId
        'x-api-key': process.env.LILA_APP_API_KEY,
      },
    });

    console.log(`[API] ✅ Physical folder created in lila-app: ${folderPath}`);
  } catch (error) {
    console.error(`[API] ⚠️ Failed to create physical folder:`, error.message);
    // No fallar el request, la carpeta se creará on-demand al subir archivo
  }

  res.status(201).json(response);
}
```

**Pros:**
- ✅ Folders físicos y metadata sincronizados
- ✅ Navegación de folders funciona inmediatamente

**Contras:**
- ⚠️ Requiere que lila-app esté disponible
- ⚠️ Extra latencia en creación de folders

---

### Opción B: Crear folders on-demand (actual)

**Estado:** Ya funciona así para uploads

**Cómo funciona:**
- Portal crea solo metadata en MongoDB
- Cuando se sube el primer archivo, lila-app hace `fs.ensureDir()`
- Carpeta física se crea automáticamente

**Pros:**
- ✅ Ya implementado
- ✅ No requiere sync explícito
- ✅ Lazy creation (solo si es necesario)

**Contras:**
- ⚠️ Carpetas vacías no existen físicamente
- ⚠️ No se puede "navegar" carpetas vacías desde file system

---

### Opción C: Eliminar legacy `data/drive` (RECOMENDADO)

**Problema:** Coexisten dos sistemas de storage

**Solución:** Eliminar completamente el sistema legacy

```bash
# 1. Backup de data/drive (por si acaso)
mv data/drive data/drive.backup

# 2. Actualizar .env
# ELIMINAR:
DRIVE_ROOT_DIR=./data/drive
DRIVE_CACHE_DIR=./data/drive-cache

# MANTENER SOLO:
FILE_STORAGE_ROOT=/Users/josezamora/projects
```

```typescript
// 3. Actualizar src/config/environment.ts
export const config = {
  drive: {
    // ❌ ELIMINAR legacy config
    // rootDir: process.env.DRIVE_ROOT_DIR || './data/drive',
    // cacheDir: process.env.DRIVE_CACHE_DIR || './data/drive-cache',

    // ✅ SOLO mantener multi-tenant config
    fileStorageRoot: process.env.FILE_STORAGE_ROOT || './storage',
    maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '25'),
  },
};
```

**Pros:**
- ✅ Sistema unificado
- ✅ No hay confusión
- ✅ Más fácil de mantener

**Contras:**
- ⚠️ Requiere verificar que NO haya código usando `DRIVE_ROOT_DIR`

---

## 🚀 PLAN DE ACCIÓN RECOMENDADO

### Paso 1: Debuggear el problema actual (INMEDIATO)

```bash
# Verificar en MongoDB
mongosh
use company_<TU_COMPANY_ID>
db.folders.find({ resourceId: "drive-global" }).pretty()

# Ver exactamente qué se guardó y qué filtros aplican
```

### Paso 2: Eliminar legacy drive (1 hora)

- [ ] Verificar que no hay código usando `DRIVE_ROOT_DIR`
- [ ] Hacer backup de `data/drive`
- [ ] Actualizar `.env` y `environment.ts`
- [ ] Eliminar referencias a legacy drive
- [ ] Build y test

### Paso 3: Implementar sync de folders (2 horas)

- [ ] Portal llama a lila-app cuando crea folder (Opción A)
- [ ] Manejar errores gracefully
- [ ] Test de integración

### Paso 4: Documentar navegación (30 min)

- [ ] Documentar estructura: `company->drive` o `company->order->dispatch`
- [ ] Ejemplos de uso
- [ ] Guía de troubleshooting

---

**Próximo paso:** ¿Quieres que comience con el debugging (Paso 1) para encontrar por qué el GET no devuelve folders?
