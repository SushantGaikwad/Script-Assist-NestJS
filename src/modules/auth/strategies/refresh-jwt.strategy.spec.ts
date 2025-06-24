import { RefreshJwtStrategy } from './refresh-jwt.strategy';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('RefreshJwtStrategy', () => {
  let strategy: RefreshJwtStrategy;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      }),
    } as any;

    strategy = new RefreshJwtStrategy(configService);
  });

  it('should return sub if token is a valid refresh token', async () => {
    const payload = { sub: 'user-id', type: 'refresh' };
    const result = await strategy.validate(payload);
    expect(result).toEqual({ sub: 'user-id' });
  });

  it('should throw UnauthorizedException if token type is invalid', async () => {
    const payload = { sub: 'user-id', type: 'access' };
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
