import {
  getCompanyBotLabel,
  getCompanyBotName,
  replaceLegacyBotLabel,
} from './company-bot';

describe('company-bot', () => {
  it('construye el bot usando slug o nombre de empresa', () => {
    expect(getCompanyBotName('constroad')).toBe('ConstroadBot');
    expect(getCompanyBotLabel('lila-app')).toBe('🤖 LilaAppBot');
  });

  it('reemplaza mensajes legacy con el bot de la empresa', () => {
    expect(
      replaceLegacyBotLabel('🤖 ConstRoadBot\n\nHola', 'mix-lab')
    ).toBe('🤖 MixLabBot\n\nHola');
  });
});
