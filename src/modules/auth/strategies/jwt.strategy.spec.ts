import { JwtStrategy } from './jwt.strategy';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

const mockUser = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'Test User',
  role: 'user',
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;
  let usersService: UsersService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'JWT_SECRET') return 'test-secret';
      }),
    } as any;

    usersService = {
      findOne: jest.fn(),
    } as any;

    strategy = new JwtStrategy(configService, usersService);
  });

  it('should return the user details if user is found', async () => {
    const payload = { sub: 'user-id' };
    (usersService.findOne as jest.Mock).mockResolvedValue(mockUser);

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      role: mockUser.role,
    });
    expect(usersService.findOne).toHaveBeenCalledWith('user-id');
  });

  it('should throw UnauthorizedException if user is not found', async () => {
    const payload = { sub: 'unknown-id' };
    (usersService.findOne as jest.Mock).mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(usersService.findOne).toHaveBeenCalledWith('unknown-id');
  });
});