import { handler } from './handler';

describe('liveSchemaExtractionLabda handler', () => {
  it('Should Call the handler and return true', async () => {
    const result = await handler();
    expect(result).toBe(true);
  });
});
