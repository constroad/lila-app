import { aMensajesOpenAi } from './openai-compat.provider';

describe('proveedor compatible con OpenAI', () => {
  it('traduce sistema, turnos, llamadas y resultados al formato de chat/completions', () => {
    const m = aMensajesOpenAi(
      [{ texto: 'persona', cacheable: true }, { texto: 'contexto' }],
      [
        { rol: 'usuario', texto: 'hola' },
        { rol: 'asistente', texto: undefined, llamadas: [{ id: 'c1', nombre: 'guardar_lead', argumentos: { distrito: 'Ate' } }] },
        { rol: 'resultado', resultados: [{ id: 'c1', contenido: '{"ok":true}' }] },
        { rol: 'asistente', texto: 'Anotado.' },
        { rol: 'usuario', texto: 'gracias' },
      ]
    );
    expect(m[0]).toEqual({ role: 'system', content: 'persona\n\ncontexto' });
    expect(m[2]).toEqual({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'guardar_lead', arguments: '{"distrito":"Ate"}' } }] });
    expect(m[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' });
    expect(m[4]).toEqual({ role: 'assistant', content: 'Anotado.' });
    expect(m[5]).toEqual({ role: 'user', content: 'gracias' });
  });
});
