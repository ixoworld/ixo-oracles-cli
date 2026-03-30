import { CLIError, ConfigError, NetworkError, ValidationError } from '../utils/errors';

describe('CLIError', () => {
  it('sets name, message, and code', () => {
    const err = new CLIError('something broke', 'MY_CODE');
    expect(err.name).toBe('CLIError');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('MY_CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to CLI_ERROR', () => {
    const err = new CLIError('fail');
    expect(err.code).toBe('CLI_ERROR');
  });

  it('stores suggestions', () => {
    const err = new CLIError('fail', 'CODE', ['try this', 'or this']);
    expect(err.suggestions).toEqual(['try this', 'or this']);
  });
});

describe('ConfigError', () => {
  it('extends CLIError with CONFIG_ERROR code', () => {
    const err = new ConfigError('bad config');
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err).toBeInstanceOf(CLIError);
  });
});

describe('NetworkError', () => {
  it('extends CLIError with NETWORK_ERROR code', () => {
    const err = new NetworkError('timeout');
    expect(err.name).toBe('NetworkError');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err).toBeInstanceOf(CLIError);
  });
});

describe('ValidationError', () => {
  it('extends CLIError with VALIDATION_ERROR code', () => {
    const err = new ValidationError('invalid input');
    expect(err.name).toBe('ValidationError');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err).toBeInstanceOf(CLIError);
  });
});
