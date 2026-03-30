import { RuntimeConfig } from '../utils/runtime-config';

describe('RuntimeConfig', () => {
  let config: RuntimeConfig;

  beforeEach(() => {
    // Access singleton and reset its state by clearing known keys
    config = RuntimeConfig.getInstance();
    config.deleteValue('projectPath');
    config.deleteValue('network');
    config.deleteValue('entityDid');
    config.deleteValue('projectName');
  });

  it('is a singleton', () => {
    const a = RuntimeConfig.getInstance();
    const b = RuntimeConfig.getInstance();
    expect(a).toBe(b);
  });

  it('stores and retrieves values', () => {
    config.addValue('projectPath', '/tmp/test');
    expect(config.getValue('projectPath')).toBe('/tmp/test');
  });

  it('returns undefined for unset values', () => {
    expect(config.getValue('projectPath')).toBeUndefined();
  });

  it('getOrThrow throws for unset values', () => {
    expect(() => config.getOrThrow('projectPath')).toThrow('Value projectPath is not set');
  });

  it('getOrThrow returns value when set', () => {
    config.addValue('projectPath', '/test');
    expect(config.getOrThrow('projectPath')).toBe('/test');
  });

  it('overwrites existing values', () => {
    config.addValue('projectPath', '/old');
    config.addValue('projectPath', '/new');
    expect(config.getValue('projectPath')).toBe('/new');
  });

  it('deletes values', () => {
    config.addValue('projectPath', '/test');
    config.deleteValue('projectPath');
    expect(config.getValue('projectPath')).toBeUndefined();
  });

  it('getConfig returns all set values', () => {
    config.addValue('projectPath', '/test');
    config.addValue('projectName', 'myproject');
    const all = config.getConfig();
    expect(all.projectPath).toBe('/test');
    expect(all.projectName).toBe('myproject');
  });
});
