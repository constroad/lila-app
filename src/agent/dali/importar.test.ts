import ExcelJS from 'exceljs';
import { GUION_ASFALTO } from '../ventas/guion.asfalto';
import { analizarArchivo, ArchivoInvalido, armarPlantilla, leerLibro, planDeImportacion, TAMANO_MAXIMO_BYTES, type HojasLeidas } from './importar';
import { editableDe } from './servicios';
import { fichaDe } from './negocio';

/**
 * IMPORTAR DESDE EXCEL (A13): la plantilla sale con lo que la empresa ya
 * tiene (sirve de exportación), se completa y se sube; se lee, se avisa lo
 * que se normalizó y recién con «Guardar» se aplica, reemplazando todo o
 * agregando solo lo nuevo.
 */
const ficha = fichaDe(
  {
    nombreComercial: 'CONSTROAD',
    descripcion: 'Empresa de asfalto',
    ruc: '20601234567',
    contacto: { telefono: '01-4801928', correo: 'ventas@constroad.com' },
    ofrece: ['emulsiones'],
    noOfrece: ['alquiler'],
  },
  { name: 'CONSTROAD SAC' },
  'Lima'
);
const guion = editableDe(GUION_ASFALTO);
const faqs = [
  {
    id: 'f1',
    pregunta: '¿Trabajan los sábados?',
    respuesta: 'Sí.',
    variantes: ['atienden sábados'],
    categoria: 'Planta',
    activa: true,
    usos: 2,
  },
];
const catalogo = {
  dicePrecios: false,
  items: [
    {
      id: 'i1',
      sku: 'MAC',
      nombre: 'Mezcla en caliente',
      categoria: 'Mezcla',
      unidad: 'm³',
      precio: 390,
      disponible: true,
      descripcion: '',
    },
  ],
};

describe('plantilla ↔ lectura', () => {
  it('la plantilla trae las cinco hojas con lo actual, y se lee de vuelta igual (y aplicada en modo agregar, no cambia nada)', async () => {
    const buffer = await armarPlantilla({ ficha, guion, faqs, catalogo });
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Negocio', 'Servicios', 'Preguntas', 'Preguntas frecuentes', 'Catálogo']);
    const hojas = leerLibro(libro);
    expect(hojas.negocio.nombreComercial).toBe('CONSTROAD');
    expect(hojas.negocio.ofrece).toEqual(['emulsiones']);
    expect(hojas.servicios.map((s) => s.id)).toEqual(guion.servicios.map((s) => s.id));
    expect(hojas.preguntas.filter((p) => p.servicio === 'colocacion')).toHaveLength(10);
    const base = hojas.preguntas.find((p) => p.servicio === 'colocacion' && p.dato === 'Superficie')!;
    expect(base.condicion).toBe('Base = preparada');
    expect(base.campo).toBe('tipoBase'); // el identificador viaja en la plantilla para que la ida y vuelta no lo cambie
    expect(base.opciones.map((o) => o.valor)).toEqual(['pavimento existente', 'base nueva']);
    expect(hojas.faqs[0]).toMatchObject({
      pregunta: '¿Trabajan los sábados?',
      variantes: ['atienden sábados'],
      activa: true,
    });
    expect(hojas.catalogo[0]).toMatchObject({
      sku: 'MAC',
      nombre: 'Mezcla en caliente',
      precio: 390,
      disponible: true,
    });
    // Ida y vuelta: la plantilla sin tocar, importada en modo agregar, deja el guion como estaba (mismos campos y opciones).
    const plan = planDeImportacion(hojas, { guion, faqs, catalogo });
    expect(plan.avisos).toEqual([]);
    const { guion: g2 } = plan.aplicar('agregar');
    expect(g2.servicios.map((s) => s.id)).toEqual(guion.servicios.map((s) => s.id));
    const col = g2.servicios.find((s) => s.id === 'colocacion')!;
    const colOriginal = guion.servicios.find((s) => s.id === 'colocacion')!;
    expect(col.preguntas.map((p) => p.campo)).toEqual(colOriginal.preguntas.map((p) => p.campo));
    expect(col.preguntas.map((p) => p.cuando)).toEqual(colOriginal.preguntas.map((p) => p.cuando));
    expect(col.preguntas.map((p) => p.opciones.map((o) => o.valor))).toEqual(colOriginal.preguntas.map((p) => p.opciones.map((o) => o.valor)));
  });
});

describe('analizarArchivo: lo que se rechaza antes de leer la base', () => {
  it('un archivo de más de 2 MB (la Mac mini lo carga en memoria) y uno que no es Excel', async () => {
    const pesado = Buffer.alloc(TAMANO_MAXIMO_BYTES + 1);
    await expect(analizarArchivo('constroad', { nombre: 'grande.xlsx', buffer: pesado })).rejects.toThrow(new ArchivoInvalido('El archivo pesa más de 2 MB'));
    await expect(
      analizarArchivo('constroad', {
        nombre: 'foto.png',
        buffer: Buffer.from('no soy un xlsx'),
      })
    ).rejects.toThrow(/tiene que ser un \.xlsx/);
  });
});

describe('planDeImportacion', () => {
  const hojas: HojasLeidas = {
    negocio: { nombreComercial: 'CONSTROAD', descripcion: 'Nueva descripción' },
    servicios: [
      {
        fila: 2,
        id: 'colocacion',
        nombre: 'Asfaltado',
        palabras: ['asfaltar'],
        modo: 'preguntas',
        activo: true,
      },
      {
        fila: 3,
        id: '',
        nombre: 'Sellado de grietas',
        palabras: [],
        modo: 'preguntas',
        activo: true,
      },
    ],
    preguntas: [
      {
        fila: 2,
        campo: '',
        servicio: 'sellado-de-grietas',
        orden: 1,
        pregunta: '¿Cuántos metros?',
        dato: 'Metros',
        tipo: 'numero',
        opciones: [],
        condicion: '',
        pista: '',
        explicacion: '',
      },
      {
        fila: 3,
        campo: '',
        servicio: 'sellado-de-grietas',
        orden: 2,
        pregunta: '¿Urgente?',
        dato: 'Urgente',
        tipo: 'opcion',
        opciones: [{ valor: 'sí', palabras: [] }],
        condicion: 'Metros = 10',
        pista: '',
        explicacion: '',
      },
      {
        fila: 4,
        campo: '',
        servicio: 'nadie',
        orden: 1,
        pregunta: '¿?',
        dato: 'X',
        tipo: 'texto',
        opciones: [],
        condicion: '',
        pista: '',
        explicacion: '',
      },
    ],
    faqs: [
      {
        fila: 2,
        pregunta: '¿Trabajan los sábados?',
        respuesta: 'Sí, hasta la 1.',
        variantes: [],
        categoria: '',
        activa: true,
      },
      {
        fila: 3,
        pregunta: '¿Emiten factura?',
        respuesta: '',
        variantes: [],
        categoria: 'Pagos',
        activa: true,
      },
    ],
    catalogo: [
      {
        fila: 2,
        sku: '',
        nombre: 'Emulsión',
        categoria: '',
        unidad: 'galón',
        precio: undefined,
        disponible: true,
        descripcion: '',
      },
      {
        fila: 3,
        sku: '',
        nombre: '',
        categoria: '',
        unidad: '',
        precio: 12,
        disponible: true,
        descripcion: '',
      },
    ],
  };

  it('cuenta, avisa lo que normalizó y arma lo que se guardaría en cada modo', () => {
    const plan = planDeImportacion(hojas, { guion, faqs, catalogo });
    expect(plan.resumen).toEqual({
      negocio: 1,
      servicios: 2,
      preguntas: 2,
      faqs: 1,
      catalogo: 1,
      total: 7,
    });
    expect(plan.avisos.map((a) => a.detalle)).toEqual([
      'El servicio «Sellado de grietas» no tiene palabras clave: Dali solo lo reconoce si el cliente lo elige por su nombre.',
      'La opción «sí» no tiene palabras clave; se usará el nombre.',
      'La condición «Metros = 10» apunta a un dato que no es de opciones; se pregunta siempre.',
      'La pregunta es de un servicio que no está en la hoja Servicios («nadie»); se omite.',
      'Sin respuesta: se omite.',
      'Sin nombre: se omite.',
    ]);
    expect(plan.avisos.map((a) => `${a.seccion}:${a.fila}`)).toEqual(['Servicios:3', 'Preguntas:3', 'Preguntas:3', 'Preguntas:4', 'Preguntas frecuentes:3', 'Catálogo:3']);

    // Reemplazar: el guion es el de la hoja (dos servicios), las FAQ y el catálogo también.
    const r = plan.aplicar('reemplazar');
    expect(r.guion.servicios.map((s) => s.id)).toEqual(['colocacion', '']);
    expect(r.guion.servicios[0].preguntas).toHaveLength(0); // la hoja no trae preguntas de colocación: reemplazar es reemplazar
    expect(r.faqs.map((f) => f.pregunta)).toEqual(['¿Trabajan los sábados?']);
    expect(r.faqs[0].respuesta).toBe('Sí, hasta la 1.');
    expect(r.catalogo.items.map((i) => i.nombre)).toEqual(['Emulsión']);
    expect(r.ficha.descripcion).toBe('Nueva descripción');

    // Agregar: lo existente queda, lo nuevo se suma; lo que coincide por id/pregunta/nombre se actualiza.
    const a = plan.aplicar('agregar');
    expect(a.guion.servicios.map((s) => s.id)).toEqual(['fabricacion', 'colocacion', 'transporte', 'venta', '']);
    const col = a.guion.servicios.find((s) => s.id === 'colocacion')!;
    expect(col.nombre).toBe('Asfaltado');
    expect(col.preguntas).toHaveLength(10); // sin preguntas en la hoja, conserva las suyas
    expect(a.guion.servicios[4].preguntas.map((p) => p.etiqueta)).toEqual(['Metros', 'Urgente']);
    expect(a.faqs.map((f) => f.respuesta)).toEqual(['Sí, hasta la 1.']);
    expect(a.faqs[0].usos).toBe(2); // se conserva el uso
    expect(a.catalogo.items.map((i) => i.nombre)).toEqual(['Mezcla en caliente', 'Emulsión']);
  });
});
