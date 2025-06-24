import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource, QueryRunner } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';


const mockUser = {
  id: 'uuid-user',
  email: 'user@example.com',
  name: 'John Doe',
  password: 'hashed-password',
  role: 'user',
  tokenVersion: 0,
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let cacheManager: any;
  let queryRunner: jest.Mocked<QueryRunner>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    } as any;

    jwtService = {
      signAsync: jest.fn(),
      decode: jest.fn(),
    } as any;

    configService = {
      get: jest.fn().mockImplementation(key => {
        const values = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_ACCESS_EXPIRATION: '15m',
          JWT_REFRESH_EXPIRATION: '7d',
        } as any;
        return values[key];
      }),
    } as any;

    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      manager: {
        update: jest.fn(),
        findOne: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it.skip('should login successfully with valid credentials', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser as unknown as User);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    jwtService.signAsync.mockResolvedValueOnce('access-token');
    jwtService.signAsync.mockResolvedValueOnce('refresh-token');

    const result = await service.login({ email: mockUser.email, password: 'validPass' });

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      },
    });
  });

  it.skip('should throw UnauthorizedException if user not found', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'wrong@example.com', password: 'invalid' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.skip('should throw UnauthorizedException if password is incorrect', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser as unknown as User);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.login({ email: mockUser.email, password: 'wrongpass' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should register new user', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue(mockUser as unknown as User);
    jwtService.signAsync.mockResolvedValueOnce('access-token');
    jwtService.signAsync.mockResolvedValueOnce('refresh-token');

    const result = await service.register({
      name: 'John',
      email: mockUser.email,
      password: 'Pass123!',
    } as unknown as RegisterDto);

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.email).toBe(mockUser.email);
  });

  it('should throw BadRequestException if user already exists', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser as unknown as User);
    await expect(
      service.register({
        name: 'John',
        email: mockUser.email,
        password: 'Pass123!',
      } as unknown as RegisterDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('should refresh tokens successfully', async () => {
    const oldToken = {
      token: 'old-refresh',
      isActive: true,
      expiresAt: new Date(Date.now() + 100000),
      user: mockUser,
    };

    (queryRunner.manager.findOne as jest.Mock).mockResolvedValue(oldToken);
    jwtService.signAsync.mockResolvedValueOnce('new-access');
    jwtService.signAsync.mockResolvedValueOnce('new-refresh');
    cacheManager.get.mockResolvedValue(null);

    const result = await service.refreshTokens('old-refresh');
    expect(result.accessToken).toBe('new-access');
    expect(result.refreshToken).toBe('new-refresh');
  });

  it('should throw if refresh token is expired or invalid', async () => {
    (queryRunner.manager.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.refreshTokens('invalid')).rejects.toThrow(UnauthorizedException);
  });

  it('should throw if refresh token is blacklisted', async () => {
    (queryRunner.manager.findOne as jest.Mock).mockResolvedValue({
      ...mockUser,
      expiresAt: new Date(Date.now() + 1000),
      isActive: true,
      user: mockUser,
    });
    cacheManager.get.mockResolvedValue(true);

    await expect(service.refreshTokens('blacklisted')).rejects.toThrow(UnauthorizedException);
  });

  it('should logout and blacklist access token', async () => {
    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });

    await service.logout('access-token', mockUser.id);

    expect(cacheManager.set).toHaveBeenCalled();
    expect(dataSource.manager.update).toHaveBeenCalled();
  });

  it('should revoke all refresh tokens for user', async () => {
    await service.revokeAllRefreshTokens(mockUser.id);
    expect(dataSource.manager.update).toHaveBeenCalledWith(
      RefreshToken,
      { userId: mockUser.id },
      { isActive: false },
    );
  });
});
