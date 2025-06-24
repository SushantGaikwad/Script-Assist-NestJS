import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const mockAuthService = {
  login: jest.fn(),
  register: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  revokeAllRefreshTokens: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should login a user', async () => {
    const dto: LoginDto = { email: 'user@example.com', password: 'password123' };
    const expectedResult = { accessToken: 'access', refreshToken: 'refresh', user: {} };
    mockAuthService.login.mockResolvedValue(expectedResult);

    const result = await controller.login(dto);
    expect(result).toEqual(expectedResult);
    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
  });

  it('should register a user', async () => {
    const dto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'StrongP@ssw0rd',
      name: 'New User',
      role: undefined as any,
    };
    const expectedResult = { accessToken: 'access', refreshToken: 'refresh', user: {} };
    mockAuthService.register.mockResolvedValue(expectedResult);

    const result = await controller.register(dto);
    expect(result).toEqual(expectedResult);
    expect(mockAuthService.register).toHaveBeenCalledWith(dto);
  });

  it('should refresh tokens', async () => {
    const dto: RefreshTokenDto = { refreshToken: 'valid-refresh-token' };
    const expectedResult = { accessToken: 'new-access', refreshToken: 'new-refresh', user: {} };
    mockAuthService.refreshTokens.mockResolvedValue(expectedResult);

    const result = await controller.refresh(dto);
    expect(result).toEqual(expectedResult);
    expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(dto.refreshToken);
  });

  it('should logout a user', async () => {
    const req = {
      headers: { authorization: 'Bearer some-access-token' },
      user: { sub: 'user-id' },
    };

    const result = await controller.logout(req);
    expect(result).toEqual({ message: 'Logout successful' });
    expect(mockAuthService.logout).toHaveBeenCalledWith('some-access-token', 'user-id');
  });

  it('should revoke all refresh tokens', async () => {
    const req = {
      user: { sub: 'user-id' },
    };

    const result = await controller.revokeAllRefreshTokens(req);
    expect(result).toEqual({ message: 'All refresh tokens have been revoked' });
    expect(mockAuthService.revokeAllRefreshTokens).toHaveBeenCalledWith('user-id');
  });
});
